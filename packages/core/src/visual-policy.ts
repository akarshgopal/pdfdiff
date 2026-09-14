import type { RenderedPage, VisualPageGeometry } from "./types.js";

/** Same default the web app ships with. */
export const DEFAULT_SENSITIVITY = 28;
export const REGION_MIN_PIXELS = 8;
/**
 * Classification runs over far more regions than are displayed, so a page's
 * class counts and its "is anything noticeable" verdict describe the whole
 * page rather than whichever regions happened to be largest.
 */
export const CLASSIFY_REGION_LIMIT = 1200;
export const ADDED_PAGE_THRESHOLD = 0.08;

/** Batch raster budget: sized for a whole document, not a zoomed inspection. */
export const STANDARD_RENDER_SCALE = 2;
export const STANDARD_RENDER_MAX_PIXELS = 3_000_000;
export const STANDARD_RENDER_MAX_DIMENSION = 2800;

export function comparisonThreshold(sensitivity: number): number {
  return Math.max(0.025, 0.18 - sensitivity * 0.00145);
}

/**
 * Changed pixels arrive one glyph at a time; these gaps rejoin a word or line
 * without pulling in the line below, and scale with the rendered page so the
 * behaviour holds for both letter pages and large-format drawings.
 */
export function regionMergeGaps(pageHeight: number): { mergeGapX: number; mergeGapY: number } {
  return {
    mergeGapX: Math.max(6, Math.round(pageHeight * 0.009)),
    mergeGapY: Math.max(2, Math.round(pageHeight * 0.0025)),
  };
}

export function geometryForPage(
  page: Pick<RenderedPage, "widthPoints" | "heightPoints" | "scale">,
  width: number,
  height: number,
  shiftX = 0,
  shiftY = 0,
): VisualPageGeometry {
  return {
    widthPoints: page.widthPoints,
    heightPoints: page.heightPoints,
    scale: page.scale,
    offsetX: (width - page.widthPoints * page.scale) / 2 + shiftX,
    offsetY: (height - page.heightPoints * page.scale) / 2 + shiftY,
  };
}

export interface RenderBounds {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

/** Cap a page's raster so scale, pixel count, and longest edge all stay in budget. */
export function boundedRenderSize(
  widthPoints: number,
  heightPoints: number,
  scale: number,
  maxPixels: number,
  maxDimension: number,
): RenderBounds {
  const pixelScale = Math.sqrt(maxPixels / (widthPoints * heightPoints));
  const dimensionScale = maxDimension / Math.max(widthPoints, heightPoints);
  const used = Math.max(0.01, Math.min(scale, pixelScale, dimensionScale));
  return {
    width: Math.max(1, Math.ceil(widthPoints * used)),
    height: Math.max(1, Math.ceil(heightPoints * used)),
    scale: used,
  };
}

export function pageCenterOffset(
  canvasWidth: number,
  canvasHeight: number,
  pageWidthPoints: number,
  pageHeightPoints: number,
  scale: number,
): { offsetX: number; offsetY: number } {
  return {
    offsetX: (canvasWidth - pageWidthPoints * scale) / 2,
    offsetY: (canvasHeight - pageHeightPoints * scale) / 2,
  };
}
