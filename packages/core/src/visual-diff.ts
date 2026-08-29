import pixelmatch from "pixelmatch";

import { throwIfAborted } from "./errors.js";
import { measure } from "./instrumentation.js";
import { findChangeRegions } from "./regions.js";
import type { RasterImage, RgbColor, VisualDiffOptions, VisualDiffResult, RenderedPage } from "./types.js";

const DEFAULT_ADDED: RgbColor = [16, 190, 190];
const DEFAULT_REMOVED: RgbColor = [238, 72, 86];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function luminance(data: Uint8ClampedArray, offset: number): number {
  return data[offset]! * 0.299 + data[offset + 1]! * 0.587 + data[offset + 2]! * 0.114;
}

function colorDistance(earlier: Uint8ClampedArray, newer: Uint8ClampedArray, offset: number): number {
  const red = earlier[offset]! - newer[offset]!;
  const green = earlier[offset + 1]! - newer[offset + 1]!;
  const blue = earlier[offset + 2]! - newer[offset + 2]!;
  return Math.sqrt(0.299 * red ** 2 + 0.587 * green ** 2 + 0.114 * blue ** 2) / 255;
}

function tintColor(color: RgbColor, distance: number): RgbColor {
  const strength = clamp(distance * 2.2, 0.24, 1);
  return [
    Math.round(255 - (255 - color[0]!) * strength),
    Math.round(255 - (255 - color[1]!) * strength),
    Math.round(255 - (255 - color[2]!) * strength),
  ];
}

function validColor(value: RgbColor | undefined, fallback: RgbColor): RgbColor {
  if (!value || value.length !== 3 || value.some((channel) => !Number.isFinite(channel))) return fallback;
  return [
    clamp(Math.round(value[0]!), 0, 255),
    clamp(Math.round(value[1]!), 0, 255),
    clamp(Math.round(value[2]!), 0, 255),
  ];
}

function changedMaskFromPixelmatch(output: Uint8ClampedArray, total: number, signal?: VisualDiffOptions["signal"]): { mask: Uint8Array; count: number } {
  const mask = new Uint8Array(total);
  let count = 0;
  for (let index = 0; index < total; index += 1) {
    if ((index & 0x3fff) === 0) throwIfAborted(signal);
    if (output[index * 4 + 3] === 0) continue;
    mask[index] = 1;
    count += 1;
  }
  return { mask, count };
}

function overlayForMask(earlier: RasterImage, newer: RasterImage, changedMask: Uint8Array, options: VisualDiffOptions): { overlay: RasterImage; directionMask: Uint8Array; addedPixels: number; removedPixels: number } {
  const total = earlier.width * earlier.height;
  const addedColor = validColor(options.addedColor, DEFAULT_ADDED);
  const removedColor = validColor(options.removedColor, DEFAULT_REMOVED);
  const unchangedOpacity = clamp(options.unchangedOpacity ?? 0.25, 0, 1);
  const overlayData = new Uint8ClampedArray(total * 4);
  const directionMask = new Uint8Array(total);
  let addedPixels = 0;
  let removedPixels = 0;

  for (let index = 0; index < total; index += 1) {
    if ((index & 0x3fff) === 0) throwIfAborted(options.signal);
    const offset = index * 4;
    if (changedMask[index] === 0) {
      const gray = Math.round(luminance(earlier.data, offset) * unchangedOpacity + 255 * (1 - unchangedOpacity));
      overlayData[offset] = gray;
      overlayData[offset + 1] = gray;
      overlayData[offset + 2] = gray;
      overlayData[offset + 3] = 255;
      continue;
    }

    const oldLuma = luminance(earlier.data, offset);
    const newLuma = luminance(newer.data, offset);
    const direction = newLuma < oldLuma ? 1 : newLuma > oldLuma ? 2 : 3;
    directionMask[index] = direction;
    const color: RgbColor = direction === 1 ? addedColor : direction === 2 ? removedColor : [184, 126, 220];
    const tintedColor = tintColor(color, colorDistance(earlier.data, newer.data, offset));
    overlayData[offset] = tintedColor[0]!;
    overlayData[offset + 1] = tintedColor[1]!;
    overlayData[offset + 2] = tintedColor[2]!;
    overlayData[offset + 3] = 255;
    if (direction === 1) addedPixels += 1;
    else if (direction === 2) removedPixels += 1;
  }

  return { overlay: { width: earlier.width, height: earlier.height, data: overlayData }, directionMask, addedPixels, removedPixels };
}

/** Compare two equal-size RGBA images without requiring a DOM or canvas. */
export function diffImages(earlier: RasterImage, newer: RasterImage, options: VisualDiffOptions = {}): VisualDiffResult {
  if (earlier.width !== newer.width || earlier.height !== newer.height) throw new RangeError("Images must have equal dimensions before diffing.");
  const { width, height } = earlier;
  const total = width * height;
  if (earlier.data.length !== total * 4 || newer.data.length !== total * 4) throw new RangeError("Raster buffers do not match their dimensions.");
  throwIfAborted(options.signal);

  const attributes = { width, height, pixels: total };
  const pixelmatchOutput = measure(options.metrics, "core.visual.pixelmatch", () => {
    const output = new Uint8ClampedArray(total * 4);
    pixelmatch(earlier.data, newer.data, output, width, height, {
      threshold: clamp(options.threshold ?? 0.1, 0, 1),
      includeAA: options.includeAA ?? false,
      diffMask: true,
      alpha: 1,
    });
    return output;
  }, attributes);
  const { mask: changedMask, count: changedPixels } = measure(options.metrics, "core.visual.changed-mask", () => changedMaskFromPixelmatch(pixelmatchOutput, total, options.signal), attributes);
  const overlay = measure(options.metrics, "core.visual.overlay", () => overlayForMask(earlier, newer, changedMask, options), { ...attributes, changedPixels });
  const regions = measure(options.metrics, "core.visual.regions", () => findChangeRegions(changedMask, width, height, {
    ...options.regionOptions,
    signal: options.signal ?? options.regionOptions?.signal,
    metrics: options.metrics ? undefined : options.regionOptions?.metrics,
  }), { ...attributes, changedPixels });
  return {
    width,
    height,
    changedPixels,
    changedPercent: total === 0 ? 0 : (changedPixels / total) * 100,
    changedMask,
    directionMask: overlay.directionMask,
    overlay: overlay.overlay,
    addedPixels: overlay.addedPixels,
    removedPixels: overlay.removedPixels,
    regions,
  };
}

export function diffRenderedPages(earlier: RenderedPage, newer: RenderedPage, options: VisualDiffOptions = {}): VisualDiffResult {
  return diffImages(earlier, newer, options);
}
