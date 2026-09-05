import pixelmatch from "pixelmatch";

import { throwIfAborted } from "./errors.js";
import { measure } from "./instrumentation.js";
import { findChangeRegions } from "./regions.js";
import type { RasterImage, RgbColor, VisualDiffOptions, VisualDiffResult } from "./types.js";
import { clamp, luminance } from "./raster-utils.js";

const DEFAULT_ADDED: RgbColor = [16, 190, 190];
const DEFAULT_REMOVED: RgbColor = [238, 72, 86];
const DEFAULT_MODIFIED: RgbColor = [184, 126, 220];
type ChangeDirection = 1 | 2 | 3;
const BACKGROUND_DISTANCE = 0.04;

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

function writeUnchangedPixel(
  target: Uint8ClampedArray,
  source: Uint8ClampedArray,
  offset: number,
  opacity: number,
): void {
  const gray = Math.round(luminance(source, offset) * opacity + 255 * (1 - opacity));
  target[offset] = gray;
  target[offset + 1] = gray;
  target[offset + 2] = gray;
  target[offset + 3] = 255;
}

function changeDirection(earlier: Uint8ClampedArray, newer: Uint8ClampedArray, offset: number): ChangeDirection {
  // ponytail: pages are rendered onto white; estimate their background if a
  // colored-paper fixture ever appears.
  const oldInk =
    Math.sqrt(
      0.299 * (255 - earlier[offset]!) ** 2 +
        0.587 * (255 - earlier[offset + 1]!) ** 2 +
        0.114 * (255 - earlier[offset + 2]!) ** 2,
    ) / 255;
  const newInk =
    Math.sqrt(
      0.299 * (255 - newer[offset]!) ** 2 +
        0.587 * (255 - newer[offset + 1]!) ** 2 +
        0.114 * (255 - newer[offset + 2]!) ** 2,
    ) / 255;
  if (oldInk <= BACKGROUND_DISTANCE && newInk > BACKGROUND_DISTANCE) return 1;
  if (newInk <= BACKGROUND_DISTANCE && oldInk > BACKGROUND_DISTANCE) return 2;
  return 3;
}

function writeChangedPixel(
  target: Uint8ClampedArray,
  earlier: Uint8ClampedArray,
  newer: Uint8ClampedArray,
  offset: number,
  addedColor: RgbColor,
  removedColor: RgbColor,
  modifiedColor: RgbColor,
): ChangeDirection {
  const direction = changeDirection(earlier, newer, offset);
  const color = direction === 1 ? addedColor : direction === 2 ? removedColor : modifiedColor;
  const tinted = tintColor(color, colorDistance(earlier, newer, offset));
  target[offset] = tinted[0]!;
  target[offset + 1] = tinted[1]!;
  target[offset + 2] = tinted[2]!;
  target[offset + 3] = 255;
  return direction;
}

/**
 * One pass over the image instead of two, writing the overlay back into
 * pixelmatch's own output buffer. Each pixel's diff alpha is read immediately
 * before that same pixel is overwritten, and no pixel reads any other, so the
 * reuse is safe and saves a second full-size RGBA allocation per page.
 */
function overlayFromDiffMask(
  earlier: RasterImage,
  newer: RasterImage,
  buffer: Uint8ClampedArray,
  options: VisualDiffOptions,
): {
  overlay: RasterImage;
  changedMask: Uint8Array;
  changedPixels: number;
  directionMask: Uint8Array;
  addedPixels: number;
  removedPixels: number;
  modifiedPixels: number;
} {
  const total = earlier.width * earlier.height;
  const addedColor = validColor(options.addedColor, DEFAULT_ADDED);
  const removedColor = validColor(options.removedColor, DEFAULT_REMOVED);
  const modifiedColor = validColor(options.modifiedColor, DEFAULT_MODIFIED);
  const unchangedOpacity = clamp(options.unchangedOpacity ?? 0.25, 0, 1);
  const changedMask = new Uint8Array(total);
  const directionMask = new Uint8Array(total);
  let changedPixels = 0;
  let addedPixels = 0;
  let removedPixels = 0;
  let modifiedPixels = 0;

  for (let index = 0; index < total; index += 1) {
    if ((index & 0x3fff) === 0) throwIfAborted(options.signal);
    const offset = index * 4;
    if (buffer[offset + 3] === 0) {
      writeUnchangedPixel(buffer, earlier.data, offset, unchangedOpacity);
      continue;
    }
    changedMask[index] = 1;
    changedPixels += 1;
    const direction = writeChangedPixel(
      buffer,
      earlier.data,
      newer.data,
      offset,
      addedColor,
      removedColor,
      modifiedColor,
    );
    directionMask[index] = direction;
    if (direction === 1) addedPixels += 1;
    else if (direction === 2) removedPixels += 1;
    else modifiedPixels += 1;
  }

  return {
    overlay: { width: earlier.width, height: earlier.height, data: buffer },
    changedMask,
    changedPixels,
    directionMask,
    addedPixels,
    removedPixels,
    modifiedPixels,
  };
}

/**
 * The overlay split into layers a compositor can recolour for free: a greyscale
 * base, and one alpha mask per direction whose alpha carries the tint strength
 * that `tintColor` would otherwise have baked in. Stacking flat colour through
 * these masks reproduces the baked overlay, but leaves the colours and the
 * unchanged opacity as presentation choices rather than pixels.
 */
export interface OverlayLayers {
  readonly width: number;
  readonly height: number;
  /** Greyscale page content, full strength; the viewer applies the opacity. */
  readonly base: RasterImage;
  readonly added: RasterImage;
  readonly removed: RasterImage;
  readonly modified: RasterImage;
}

function layerStrength(earlier: Uint8ClampedArray, newer: Uint8ClampedArray, offset: number): number {
  return Math.round(clamp(colorDistance(earlier, newer, offset) * 2.2, 0.24, 1) * 255);
}

/**
 * One pass producing the base plus added, removed, and modified masks.
 */
export function overlayLayers(
  earlier: RasterImage,
  newer: RasterImage,
  directionMask: Uint8Array,
  signal?: VisualDiffOptions["signal"],
): OverlayLayers {
  const { width, height } = earlier;
  const total = width * height;
  const base = new Uint8ClampedArray(total * 4);
  const added = new Uint8ClampedArray(total * 4);
  const removed = new Uint8ClampedArray(total * 4);
  const modified = new Uint8ClampedArray(total * 4);

  for (let index = 0; index < total; index += 1) {
    if ((index & 0x3fff) === 0) throwIfAborted(signal);
    const offset = index * 4;
    const direction = directionMask[index];
    if (!direction) {
      const gray = Math.round(luminance(earlier.data, offset));
      base[offset] = gray;
      base[offset + 1] = gray;
      base[offset + 2] = gray;
      base[offset + 3] = 255;
      continue;
    }
    // A changed pixel is carried entirely by its mask, so the base stays clear
    // and the colour underneath never muddies the tint.
    const target = direction === 1 ? added : direction === 2 ? removed : modified;
    target[offset + 3] = layerStrength(earlier.data, newer.data, offset);
  }

  return {
    width,
    height,
    base: { width, height, data: base },
    added: { width, height, data: added },
    removed: { width, height, data: removed },
    modified: { width, height, data: modified },
  };
}

/** Compare two equal-size RGBA images without requiring a DOM or canvas. */
export function diffImages(
  earlier: RasterImage,
  newer: RasterImage,
  options: VisualDiffOptions = {},
): VisualDiffResult {
  if (earlier.width !== newer.width || earlier.height !== newer.height)
    throw new RangeError("Images must have equal dimensions before diffing.");
  const { width, height } = earlier;
  const total = width * height;
  if (earlier.data.length !== total * 4 || newer.data.length !== total * 4)
    throw new RangeError("Raster buffers do not match their dimensions.");
  throwIfAborted(options.signal);

  const attributes = { width, height, pixels: total };
  const pixelmatchOutput = measure(
    options.metrics,
    "core.visual.pixelmatch",
    () => {
      const output = new Uint8ClampedArray(total * 4);
      pixelmatch(earlier.data, newer.data, output, width, height, {
        threshold: clamp(options.threshold ?? 0.1, 0, 1),
        includeAA: options.includeAA ?? false,
        diffMask: true,
        alpha: 1,
      });
      return output;
    },
    attributes,
  );
  const overlay = measure(
    options.metrics,
    "core.visual.overlay",
    () => overlayFromDiffMask(earlier, newer, pixelmatchOutput, options),
    attributes,
  );
  const { changedMask, changedPixels } = overlay;
  const regions = measure(
    options.metrics,
    "core.visual.regions",
    () =>
      findChangeRegions(changedMask, width, height, {
        ...options.regionOptions,
        signal: options.signal ?? options.regionOptions?.signal,
        metrics: options.metrics ? undefined : options.regionOptions?.metrics,
      }),
    { ...attributes, changedPixels },
  );
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
    modifiedPixels: overlay.modifiedPixels,
    regions,
  };
}
