import { throwIfAborted } from "./errors.js";
import { measure } from "./instrumentation.js";
import type { ChangeRegion, RegionOptions } from "./types.js";

const DEFAULT_MIN_PIXELS = 4;
const DEFAULT_MAX_REGIONS = 1000;
const FOUR_CONNECTED: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const EIGHT_CONNECTED: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

interface RegionSummary {
  pixelCount: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function checkAbortPeriodically(index: number, signal: RegionOptions["signal"]): void {
  if ((index & 0x3fff) === 0) throwIfAborted(signal);
}

function neighborIndex(x: number, y: number, dx: number, dy: number, width: number, height: number): number {
  const nextX = x + dx;
  const nextY = y + dy;
  return nextX < 0 || nextX >= width || nextY < 0 || nextY >= height ? -1 : nextY * width + nextX;
}

function isUnvisitedChange(index: number, mask: Uint8Array, visited: Uint8Array): boolean {
  return index >= 0 && visited[index] === 0 && mask[index] !== 0;
}

function floodRegion(mask: Uint8Array, width: number, height: number, start: number, visited: Uint8Array, queue: Int32Array, offsets: ReadonlyArray<readonly [number, number]>, signal: RegionOptions["signal"]): RegionSummary {
  let head = 0;
  let tail = 1;
  queue[0] = start;
  visited[start] = 1;
  const summary: RegionSummary = { pixelCount: 0, minX: width, minY: height, maxX: -1, maxY: -1 };

  while (head < tail) {
    checkAbortPeriodically(head, signal);
    const index = queue[head++];
    const x = index % width;
    const y = (index / width) | 0;
    summary.pixelCount += 1;
    summary.minX = Math.min(summary.minX, x);
    summary.minY = Math.min(summary.minY, y);
    summary.maxX = Math.max(summary.maxX, x);
    summary.maxY = Math.max(summary.maxY, y);

    for (const [dx, dy] of offsets) {
      const next = neighborIndex(x, y, dx, dy, width, height);
      if (!isUnvisitedChange(next, mask, visited)) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }

  return summary;
}

function validateMask(mask: Uint8Array, width: number, height: number): number {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Region width and height must be positive integers.");
  }
  const total = width * height;
  if (mask.length !== total) throw new RangeError(`Region mask has ${mask.length} pixels; expected ${total}.`);
  return total;
}

function toChangeRegion(summary: RegionSummary, id: number): ChangeRegion {
  const width = summary.maxX - summary.minX + 1;
  const height = summary.maxY - summary.minY + 1;
  return { id, x: summary.minX, y: summary.minY, width, height, pixelCount: summary.pixelCount, area: width * height };
}

/**
 * A single edited line of text breaks into one component per glyph, so the raw
 * scan keeps a far larger working set than the caller asked for; merging runs
 * before the limit is applied, otherwise the glyphs are discarded before they
 * can be rejoined.
 */
function scanCeiling(maxRegions: number, mergeGapX: number, mergeGapY: number): number {
  return mergeGapX > 0 || mergeGapY > 0 ? Math.max(maxRegions, 20_000) : maxRegions;
}

function trimRegions(regions: ChangeRegion[], ceiling: number): void {
  if (regions.length <= ceiling * 2) return;
  regions.sort((a, b) => b.pixelCount - a.pixelCount);
  regions.length = ceiling;
}

function findRoot(parents: Int32Array, index: number): number {
  let root = index;
  while (parents[root] !== root) root = parents[root]!;
  for (let step = index; parents[step] !== root; ) {
    const next = parents[step]!;
    parents[step] = root;
    step = next;
  }
  return root;
}

function union(parents: Int32Array, a: number, b: number): void {
  const rootA = findRoot(parents, a);
  const rootB = findRoot(parents, b);
  if (rootA !== rootB) parents[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
}

function withinGap(a: ChangeRegion, b: ChangeRegion, mergeGapX: number, mergeGapY: number): boolean {
  const gapX = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
  const gapY = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
  return gapX <= mergeGapX && gapY <= mergeGapY;
}

function mergedRegion(members: readonly ChangeRegion[]): ChangeRegion {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, pixelCount = 0, id = Infinity;
  for (const member of members) {
    minX = Math.min(minX, member.x);
    minY = Math.min(minY, member.y);
    maxX = Math.max(maxX, member.x + member.width);
    maxY = Math.max(maxY, member.y + member.height);
    pixelCount += member.pixelCount;
    id = Math.min(id, member.id);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return { id, x: minX, y: minY, width, height, pixelCount, area: width * height };
}

/**
 * Join components that belong to the same edit. Sweeping by left edge keeps the
 * comparison window small, so this stays near-linear on real pages instead of
 * comparing every pair.
 */
function mergeNearbyRegions(regions: ChangeRegion[], mergeGapX: number, mergeGapY: number, signal: RegionOptions["signal"]): ChangeRegion[] {
  if (regions.length < 2 || (mergeGapX <= 0 && mergeGapY <= 0)) return regions;
  const ordered = [...regions].sort((a, b) => a.x - b.x || a.y - b.y);
  const parents = new Int32Array(ordered.length);
  for (let index = 0; index < ordered.length; index += 1) parents[index] = index;

  const active: number[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    checkAbortPeriodically(index, signal);
    const region = ordered[index]!;
    for (let slot = active.length - 1; slot >= 0; slot -= 1) {
      const candidate = ordered[active[slot]!]!;
      if (candidate.x + candidate.width + mergeGapX < region.x) {
        active.splice(slot, 1);
        continue;
      }
      if (withinGap(region, candidate, mergeGapX, mergeGapY)) union(parents, index, active[slot]!);
    }
    active.push(index);
  }

  const groups = new Map<number, ChangeRegion[]>();
  for (let index = 0; index < ordered.length; index += 1) {
    const root = findRoot(parents, index);
    const group = groups.get(root);
    if (group) group.push(ordered[index]!);
    else groups.set(root, [ordered[index]!]);
  }
  return [...groups.values()].map((members) => members.length === 1 ? members[0]! : mergedRegion(members));
}

/**
 * Group regions into rough text lines so ordering survives small baseline
 * wobble. Banding on the top edge rather than the centre keeps a tall merged
 * block with the line it starts on instead of sinking it down the page.
 */
function readingOrderBand(region: ChangeRegion, bandHeight: number): number {
  return Math.floor(region.y / bandHeight);
}

function sortForReading(regions: ChangeRegion[], height: number): ChangeRegion[] {
  const bandHeight = Math.max(1, Math.round(height * 0.01));
  return regions.sort((a, b) =>
    readingOrderBand(a, bandHeight) - readingOrderBand(b, bandHeight) || a.x - b.x || a.y - b.y || a.id - b.id);
}

/** Keep the most substantial regions, then present them the way the page reads. */
function finalizeRegions(regions: ChangeRegion[], maxRegions: number, readingOrder: boolean, height: number): ChangeRegion[] {
  regions.sort((a, b) => b.pixelCount - a.pixelCount || a.id - b.id);
  if (regions.length > maxRegions) regions.length = maxRegions;
  return readingOrder ? sortForReading(regions, height) : regions;
}

/** Find connected components in a one-byte changed-pixel mask. */
export function findChangeRegions(mask: Uint8Array, width: number, height: number, options: RegionOptions = {}): ChangeRegion[] {
  const attributes = { width, height, pixels: width * height };
  return measure(options.metrics, "core.regions", () => findChangeRegionsUnmeasured(mask, width, height, options), attributes);
}

function findChangeRegionsUnmeasured(mask: Uint8Array, width: number, height: number, options: RegionOptions): ChangeRegion[] {
  const total = validateMask(mask, width, height);
  const minPixels = Math.max(1, Math.floor(options.minPixels ?? DEFAULT_MIN_PIXELS));
  const maxRegions = Math.max(1, Math.floor(options.maxRegions ?? DEFAULT_MAX_REGIONS));
  const mergeGapX = Math.max(0, options.mergeGapX ?? 0);
  const mergeGapY = Math.max(0, options.mergeGapY ?? 0);
  const offsets = options.connectivity === 4 ? FOUR_CONNECTED : EIGHT_CONNECTED;
  const ceiling = scanCeiling(maxRegions, mergeGapX, mergeGapY);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const regions: ChangeRegion[] = [];
  let nextId = 1;

  for (let start = 0; start < total; start += 1) {
    checkAbortPeriodically(start, options.signal);
    if (mask[start] === 0 || visited[start] !== 0) continue;
    const summary = floodRegion(mask, width, height, start, visited, queue, offsets, options.signal);
    if (summary.pixelCount < minPixels) continue;
    regions.push(toChangeRegion(summary, nextId++));
    trimRegions(regions, ceiling);
  }

  const merged = mergeNearbyRegions(regions, mergeGapX, mergeGapY, options.signal);
  return finalizeRegions(merged, maxRegions, options.readingOrder ?? false, height);
}
