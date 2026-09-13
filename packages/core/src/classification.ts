import type { ChangeRegion, TextQuad, VisualPageGeometry } from "./types.js";
import type { SemanticPageDiff } from "./semantic-types.js";

/**
 * A pixel diff says where the page repainted. It cannot say why. One edit near
 * the top pushes every line below it down, and all of that movement reads as
 * change even though not a word of it differs. Crossing the pixel regions with
 * what the semantic layer already knows — which lines actually changed, and
 * which merely moved — turns a wall of rectangles into an answer a reviewer can
 * act on, and lets the noisy classes be hidden outright.
 */

export type ChangeClass = "content" | "reflow" | "formatting" | "graphic";

export interface ClassifierBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ClassifiedRegion extends ChangeRegion {
  readonly changeClass: ChangeClass;
}

export type ChangeClassCounts = Readonly<Record<ChangeClass, number>>;

export interface PageClassification {
  readonly regions: readonly ClassifiedRegion[];
  readonly counts: ChangeClassCounts;
  /** True when nothing on the page changed in a way a reader would notice. */
  readonly noticeable: boolean;
}

export interface ClassifyRegionsInput {
  readonly regions: readonly ChangeRegion[];
  /** Text the semantic layer reports as genuinely edited. */
  readonly changedText: readonly ClassifierBox[];
  /** Text that is identical on both sides but drawn somewhere else. */
  readonly movedText: readonly ClassifierBox[];
  /** Text that is identical on both sides and drawn in the same place. */
  readonly staticText: readonly ClassifierBox[];
  /** Slack in pixels when testing whether a region sits on a piece of text. */
  readonly tolerance?: number;
}

const DEFAULT_TOLERANCE = 2;

function intersects(region: ChangeRegion, box: ClassifierBox, tolerance: number): boolean {
  return (
    region.x - tolerance < box.x + box.width &&
    box.x < region.x + region.width + tolerance &&
    region.y - tolerance < box.y + box.height &&
    box.y < region.y + region.height + tolerance
  );
}

function anyIntersects(region: ChangeRegion, boxes: readonly ClassifierBox[], tolerance: number): boolean {
  return boxes.some((box) => intersects(region, box, tolerance));
}

/**
 * Classes are tested most-significant first: a region touching genuinely edited
 * text is content even if it also touches text that merely moved.
 */
function classifyRegion(region: ChangeRegion, input: ClassifyRegionsInput, tolerance: number): ChangeClass {
  if (anyIntersects(region, input.changedText, tolerance)) return "content";
  if (anyIntersects(region, input.movedText, tolerance)) return "reflow";
  if (anyIntersects(region, input.staticText, tolerance)) return "formatting";
  return "graphic";
}

function emptyCounts(): Record<ChangeClass, number> {
  return { content: 0, reflow: 0, formatting: 0, graphic: 0 };
}

const NOTICEABLE_CLASSES: ReadonlySet<ChangeClass> = new Set<ChangeClass>(["content", "graphic"]);

/**
 * Regions are capped for display, but the cap must be applied *after*
 * classification and it must not rank on size alone. A reflowed page produces
 * hundreds of large "the whole line moved" regions that would otherwise crowd
 * out the handful of small ones covering the words that actually changed —
 * taking the page's counts, and its `noticeable` verdict, down with them.
 * Real changes are kept first; whatever survives is returned in reading order.
 */
export function limitRegions(regions: readonly ClassifiedRegion[], maxRegions: number): ClassifiedRegion[] {
  if (regions.length <= maxRegions) return [...regions];
  return regions
    .map((region, order) => ({ region, order }))
    .sort(
      (first, second) =>
        Number(NOTICEABLE_CLASSES.has(second.region.changeClass)) -
          Number(NOTICEABLE_CLASSES.has(first.region.changeClass)) ||
        second.region.pixelCount - first.region.pixelCount ||
        first.order - second.order,
    )
    .slice(0, maxRegions)
    .sort((first, second) => first.order - second.order)
    .map((entry) => entry.region);
}

export function classifyRegions(input: ClassifyRegionsInput): PageClassification {
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;
  const counts = emptyCounts();
  const regions = input.regions.map((region) => {
    const changeClass = classifyRegion(region, input, tolerance);
    counts[changeClass] += 1;
    return { ...region, changeClass };
  });
  return { regions, counts, noticeable: counts.content > 0 || counts.graphic > 0 };
}

/** Text lives in PDF points; regions live in rendered pixels. Meet in pixels. */
function quadBox(quad: TextQuad, geometry: VisualPageGeometry): ClassifierBox {
  const xs = quad.map((point) => point.x * geometry.scale + geometry.offsetX);
  const ys = quad.map((point) => point.y * geometry.scale + geometry.offsetY);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function quadBoxes(quads: readonly TextQuad[], geometry: VisualPageGeometry | undefined): ClassifierBox[] {
  return geometry ? quads.map((quad) => quadBox(quad, geometry)) : [];
}

function classificationBoxes(
  semantic: SemanticPageDiff,
  geometry: { earlier?: VisualPageGeometry; newer?: VisualPageGeometry },
) {
  const changedText = [
    ...semantic.beforeOverlays.flatMap((overlay) => quadBoxes(overlay.quads, geometry.earlier)),
    ...semantic.afterOverlays.flatMap((overlay) => quadBoxes(overlay.quads, geometry.newer)),
  ];
  const unchanged = semantic.unchangedLines ?? [];
  const movedText = unchanged
    .filter((line) => line.shifted)
    .flatMap((line) => [
      ...quadBoxes(line.beforeQuads, geometry.earlier),
      ...quadBoxes(line.afterQuads, geometry.newer),
    ]);
  const staticText = unchanged
    .filter((line) => !line.shifted)
    .flatMap((line) => quadBoxes(line.afterQuads, geometry.newer));
  return { changedText, movedText, staticText };
}

/** Classify pixel regions against the semantic layer. Both adapters call this. */
export function classifyPage(input: {
  readonly regions: readonly ChangeRegion[];
  readonly semantic: SemanticPageDiff;
  readonly geometry: { earlier?: VisualPageGeometry; newer?: VisualPageGeometry };
  readonly tolerance?: number;
}): PageClassification {
  return classifyRegions({
    regions: input.regions,
    ...classificationBoxes(input.semantic, input.geometry),
    tolerance: input.tolerance,
  });
}

export function zeroClassCounts(): ChangeClassCounts {
  return emptyCounts();
}
