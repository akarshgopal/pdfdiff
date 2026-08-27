import { throwIfAborted } from "./errors";
import type { ChangeRegion, RegionOptions } from "./types";

const DEFAULT_MIN_PIXELS = 4;
const DEFAULT_MAX_REGIONS = 1000;

/** Find connected components in a one-byte changed-pixel mask. */
export function findChangeRegions(
  mask: Uint8Array,
  width: number,
  height: number,
  options: RegionOptions = {},
): ChangeRegion[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Region width and height must be positive integers.");
  }
  const total = width * height;
  if (mask.length !== total) {
    throw new RangeError(`Region mask has ${mask.length} pixels; expected ${total}.`);
  }

  const minPixels = Math.max(1, Math.floor(options.minPixels ?? DEFAULT_MIN_PIXELS));
  const maxRegions = Math.max(1, Math.floor(options.maxRegions ?? DEFAULT_MAX_REGIONS));
  const connectivity = options.connectivity ?? 8;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const regions: ChangeRegion[] = [];
  let nextId = 1;

  const offsets =
    connectivity === 4
      ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
      : [
          [-1, -1], [0, -1], [1, -1],
          [-1, 0], [1, 0],
          [-1, 1], [0, 1], [1, 1],
        ];

  for (let start = 0; start < total; start += 1) {
    if ((start & 0x3fff) === 0) throwIfAborted(options.signal);
    if (mask[start] === 0 || visited[start] !== 0) continue;

    let head = 0;
    let tail = 1;
    queue[0] = start;
    visited[start] = 1;
    let pixelCount = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (head < tail) {
      if ((head & 0x3fff) === 0) throwIfAborted(options.signal);
      const index = queue[head++];
      const x = index % width;
      const y = (index / width) | 0;
      pixelCount += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

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

    if (pixelCount < minPixels) continue;
    regions.push({
      id: nextId++,
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      pixelCount,
      area: (maxX - minX + 1) * (maxY - minY + 1),
    });

    // Bound retained metadata even if a noisy page has many components.
    if (regions.length > maxRegions * 2) {
      regions.sort((a, b) => b.pixelCount - a.pixelCount);
      regions.length = maxRegions;
    }
  }

  regions.sort((a, b) => b.pixelCount - a.pixelCount || a.id - b.id);
  if (regions.length > maxRegions) regions.length = maxRegions;
  return regions;
}
