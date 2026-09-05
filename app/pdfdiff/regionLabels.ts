import type { ChangeClass, DiffRegion, DiffRegionKind, DiffSemanticOverlay } from "@pdfdiff/viewer-react";

const MAX_REGION_LABEL_CHARS = 60;
/** Changed pixels sit slightly outside their glyph quad, so match with a little slack. */
const REGION_MATCH_TOLERANCE = 0.4;

/** A rectangle in page-relative percentages, matching the viewer's overlay coordinates. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface OverlayBox extends Box {
  readonly id: string;
  readonly kind: DiffRegionKind;
  readonly text: string;
}

function overlayBox(overlay: DiffSemanticOverlay): OverlayBox | null {
  const points = overlay.quads.flat();
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { id: overlay.id, kind: overlay.kind, text: overlay.text, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function overlapArea(a: Box, b: Box): number {
  const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapWidth > 0 && overlapHeight > 0 ? overlapWidth * overlapHeight : 0;
}

function padded(box: Box, amount: number): Box {
  return { x: box.x - amount, y: box.y - amount, width: box.width + amount * 2, height: box.height + amount * 2 };
}

function bestOverlayMatch(region: Box, overlays: readonly OverlayBox[]): OverlayBox | null {
  const target = padded(region, REGION_MATCH_TOLERANCE);
  let best: OverlayBox | null = null;
  let bestArea = 0;
  for (const overlay of overlays) {
    const area = overlapArea(target, overlay);
    if (area > bestArea) {
      best = overlay;
      bestArea = area;
    }
  }
  return best;
}

export function regionLabel(kind: DiffRegionKind, text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const clipped = normalized.length > MAX_REGION_LABEL_CHARS ? `${normalized.slice(0, MAX_REGION_LABEL_CHARS - 1)}…` : normalized;
  const prefix = kind === "added" ? "Added" : kind === "removed" ? "Removed" : "Changed";
  return `${prefix} “${clipped}”`;
}

function unionBox(boxes: readonly Box[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

type InputRegion = Box & { id: string; changeClass?: ChangeClass };

interface RegionGroup {
  readonly id: string;
  readonly boxes: InputRegion[];
  readonly match: OverlayBox | null;
}

/**
 * A text change that wraps across lines produces one region per line, and every
 * one of them matches the same overlay. Grouping by that overlay keeps the list
 * to one entry per change instead of repeating the same sentence.
 */
function groupByMatch(boxes: readonly InputRegion[], overlayBoxes: readonly OverlayBox[]): RegionGroup[] {
  const groups: RegionGroup[] = [];
  const byOverlay = new Map<string, RegionGroup>();
  for (const box of boxes) {
    const match = bestOverlayMatch(box, overlayBoxes);
    const existing = match ? byOverlay.get(match.id) : undefined;
    if (existing) {
      existing.boxes.push(box);
      continue;
    }
    const group: RegionGroup = { id: box.id, boxes: [box], match };
    groups.push(group);
    if (match) byOverlay.set(match.id, group);
  }
  return groups;
}

/** Name each changed-pixel region after the text change it covers; the rest are graphic-only. */
export function describeRegions(boxes: readonly InputRegion[], overlays: readonly DiffSemanticOverlay[]): DiffRegion[] {
  const overlayBoxes = overlays.map(overlayBox).filter((box): box is OverlayBox => box !== null);
  let graphicCount = 0;
  return groupByMatch(boxes, overlayBoxes).map((group) => {
    const label = group.match ? regionLabel(group.match.kind, group.match.text) : null;
    graphicCount += label ? 0 : 1;
    return {
      id: group.id,
      ...unionBox(group.boxes),
      kind: label && group.match ? group.match.kind : "changed",
      label: label ?? `Changed area ${graphicCount}`,
      changeClass: group.boxes[0]!.changeClass,
    };
  });
}
