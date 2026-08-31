import type { ChangeRegion } from "./types.js";

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
  return region.x - tolerance < box.x + box.width
    && box.x < region.x + region.width + tolerance
    && region.y - tolerance < box.y + box.height
    && box.y < region.y + region.height + tolerance;
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

export function zeroClassCounts(): ChangeClassCounts {
  return emptyCounts();
}
