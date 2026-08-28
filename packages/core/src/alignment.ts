import { throwIfAborted } from "./errors.js";
import type { AbortSignalLike, RasterImage } from "./types.js";

function luminance(data: Uint8ClampedArray, offset: number): number {
  return data[offset]! * 0.299 + data[offset + 1]! * 0.587 + data[offset + 2]! * 0.114;
}

function blankImage(width: number, height: number): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  return { width, height, data };
}

function shiftImage(source: RasterImage, dx: number, dy: number): RasterImage {
  if (dx === 0 && dy === 0) return source;
  const target = blankImage(source.width, source.height);
  const { width, height } = source;
  for (let y = Math.max(0, dy); y < Math.min(height, height + dy); y += 1) {
    const sourceY = y - dy;
    const targetStart = (y * width + Math.max(0, dx)) * 4;
    const sourceStart = (sourceY * width + Math.max(0, -dx)) * 4;
    const pixels = width - Math.abs(dx);
    if (pixels > 0) target.data.set(source.data.subarray(sourceStart, sourceStart + pixels * 4), targetStart);
  }
  return target;
}

function translationScore(earlier: RasterImage, newer: RasterImage, dx: number, dy: number): number {
  const { width, height } = earlier;
  const stride = Math.max(5, Math.ceil(Math.max(width, height) / 420));
  let score = 0;
  let samples = 0;
  for (let y = 18; y < height - 18; y += stride) {
    const newerY = y - dy;
    if (newerY < 0 || newerY >= height) continue;
    for (let x = 18; x < width - 18; x += stride) {
      const newerX = x - dx;
      if (newerX < 0 || newerX >= width) continue;
      const earlierOffset = (y * width + x) * 4;
      const newerOffset = (newerY * width + newerX) * 4;
      score += Math.abs(luminance(earlier.data, earlierOffset) - luminance(newer.data, newerOffset));
      samples += 1;
    }
  }
  return samples ? score / samples : Number.POSITIVE_INFINITY;
}

export interface TranslationAlignment {
  readonly image: RasterImage;
  readonly dx: number;
  readonly dy: number;
}

/** Find and apply a small translation so two raster pages share their content grid. */
export function alignByTranslation(earlier: RasterImage, newer: RasterImage, signal?: AbortSignalLike): TranslationAlignment {
  let bestX = 0;
  let bestY = 0;
  let bestScore = translationScore(earlier, newer, 0, 0);
  const maxShift = Math.max(4, Math.min(18, Math.round(Math.max(earlier.width, earlier.height) / 180)));
  for (let dy = -maxShift; dy <= maxShift; dy += 2) {
    for (let dx = -maxShift; dx <= maxShift; dx += 2) {
      throwIfAborted(signal);
      const score = translationScore(earlier, newer, dx, dy);
      if (score < bestScore) {
        bestScore = score;
        bestX = dx;
        bestY = dy;
      }
    }
  }
  for (let dy = bestY - 1; dy <= bestY + 1; dy += 1) {
    for (let dx = bestX - 1; dx <= bestX + 1; dx += 1) {
      throwIfAborted(signal);
      const score = translationScore(earlier, newer, dx, dy);
      if (score < bestScore) {
        bestScore = score;
        bestX = dx;
        bestY = dy;
      }
    }
  }
  return { image: shiftImage(newer, bestX, bestY), dx: bestX, dy: bestY };
}
