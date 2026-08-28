import { throwIfAborted } from "./errors.js";
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

function floodRegion(mask: Uint8Array, width: number, height: number, start: number, visited: Uint8Array, queue: Int32Array, offsets: ReadonlyArray<readonly [number, number]>, signal: RegionOptions["signal"]): RegionSummary {
  let head = 0;
  let tail = 1;
  queue[0] = start;
  visited[start] = 1;
  const summary: RegionSummary = { pixelCount: 0, minX: width, minY: height, maxX: -1, maxY: -1 };

  while (head < tail) {
    if ((head & 0x3fff) === 0) throwIfAborted(signal);
    const index = queue[head++];
    const x = index % width;
    const y = (index / width) | 0;
    summary.pixelCount += 1;
    summary.minX = Math.min(summary.minX, x);
    summary.minY = Math.min(summary.minY, y);
    summary.maxX = Math.max(summary.maxX, x);
    summary.maxY = Math.max(summary.maxY, y);

    for (const [dx, dy] of offsets) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
      const next = nextY * width + nextX;
      if (visited[next] !== 0 || mask[next] === 0) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }

  return summary;
}

function trimRegions(regions: ChangeRegion[], maxRegions: number): void {
  if (regions.length <= maxRegions * 2) return;
  regions.sort((a, b) => b.pixelCount - a.pixelCount);
  regions.length = maxRegions;
}

/** Find connected components in a one-byte changed-pixel mask. */
export function findChangeRegions(mask: Uint8Array, width: number, height: number, options: RegionOptions = {}): ChangeRegion[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Region width and height must be positive integers.");
  }
  const total = width * height;
  if (mask.length !== total) throw new RangeError(`Region mask has ${mask.length} pixels; expected ${total}.`);

  const minPixels = Math.max(1, Math.floor(options.minPixels ?? DEFAULT_MIN_PIXELS));
  const maxRegions = Math.max(1, Math.floor(options.maxRegions ?? DEFAULT_MAX_REGIONS));
  const offsets = options.connectivity === 4 ? FOUR_CONNECTED : EIGHT_CONNECTED;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const regions: ChangeRegion[] = [];
  let nextId = 1;

  for (let start = 0; start < total; start += 1) {
    if ((start & 0x3fff) === 0) throwIfAborted(options.signal);
    if (mask[start] === 0 || visited[start] !== 0) continue;
    const summary = floodRegion(mask, width, height, start, visited, queue, offsets, options.signal);
    if (summary.pixelCount < minPixels) continue;
    const regionWidth = summary.maxX - summary.minX + 1;
    const regionHeight = summary.maxY - summary.minY + 1;
    regions.push({ id: nextId++, x: summary.minX, y: summary.minY, width: regionWidth, height: regionHeight, pixelCount: summary.pixelCount, area: regionWidth * regionHeight });
    trimRegions(regions, maxRegions);
  }

  regions.sort((a, b) => b.pixelCount - a.pixelCount || a.id - b.id);
  if (regions.length > maxRegions) regions.length = maxRegions;
  return regions;
}
