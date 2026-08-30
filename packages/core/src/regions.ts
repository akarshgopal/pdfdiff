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

function trimRegions(regions: ChangeRegion[], maxRegions: number): void {
  if (regions.length <= maxRegions * 2) return;
  regions.sort((a, b) => b.pixelCount - a.pixelCount);
  regions.length = maxRegions;
}

function finalizeRegions(regions: ChangeRegion[], maxRegions: number): ChangeRegion[] {
  regions.sort((a, b) => b.pixelCount - a.pixelCount || a.id - b.id);
  if (regions.length > maxRegions) regions.length = maxRegions;
  return regions;
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
  const offsets = options.connectivity === 4 ? FOUR_CONNECTED : EIGHT_CONNECTED;
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
    trimRegions(regions, maxRegions);
  }

  return finalizeRegions(regions, maxRegions);
}
