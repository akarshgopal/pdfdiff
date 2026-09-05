import {
  alignByTranslation,
  diffImages,
  overlayLayers,
  type ChangeRegion,
  type DiffMetric,
  type DiffMetricSink,
  type OverlayLayers,
  type RasterImage,
  type RegionOptions,
  type RgbColor,
} from "@pdfdiff/core";

/**
 * The pixel half of a page comparison: align the two rasters, diff them, and
 * optionally build the recolourable layers. It is the only part of the pipeline
 * that is both expensive and free of PDF.js — around 3.9s of a 10s 43-page run,
 * against 2.5s of canvas rendering that has to stay on the main thread — so it
 * is the part worth moving to a worker.
 *
 * Everything here crosses a postMessage boundary, so the job speaks in plain
 * data: no AbortSignal, no metric callbacks, no class instances.
 */
export interface RasterDiffJob {
  readonly width: number;
  readonly height: number;
  /** RGBA pixels, transferred in and handed back so neither side copies. */
  readonly earlier: ArrayBuffer;
  readonly newer: ArrayBuffer;
  readonly alignByTranslation: boolean;
  readonly threshold: number;
  readonly includeAA: boolean;
  readonly addedColor?: RgbColor;
  readonly removedColor?: RgbColor;
  readonly modifiedColor?: RgbColor;
  readonly unchangedOpacity: number;
  readonly regionOptions: Omit<RegionOptions, "signal" | "metrics">;
  readonly withLayers: boolean;
  /** Collect timings inside the worker when the host is recording them. */
  readonly withMetrics: boolean;
}

export interface RasterDiffJobResult {
  /** The buffers the job borrowed, returned so the caller can keep using them. */
  readonly earlier: ArrayBuffer;
  /** The newer raster after alignment; a different buffer only when it shifted. */
  readonly newer: ArrayBuffer;
  readonly dx: number;
  readonly dy: number;
  readonly changedPixels: number;
  readonly changedPercent: number;
  readonly overlay: ArrayBuffer;
  readonly regions: readonly ChangeRegion[];
  readonly layers?: { base: ArrayBuffer; added: ArrayBuffer; removed: ArrayBuffer; modified: ArrayBuffer };
  readonly metrics: readonly DiffMetric[];
}

/** Wrap a transferred buffer back into the shape the core algorithms take. */
export function rasterImage(width: number, height: number, buffer: ArrayBuffer): RasterImage {
  return { width, height, data: new Uint8ClampedArray(buffer) };
}

/** Every buffer the result owns, so postMessage can hand them over rather than copy. */
export function resultTransfers(result: RasterDiffJobResult): ArrayBuffer[] {
  const buffers = [result.earlier, result.newer, result.overlay];
  if (result.layers)
    buffers.push(result.layers.base, result.layers.added, result.layers.removed, result.layers.modified);
  return buffers;
}

export function runRasterDiffJob(job: RasterDiffJob): RasterDiffJobResult {
  const metrics: DiffMetric[] = [];
  const sink: DiffMetricSink | undefined = job.withMetrics ? (metric) => void metrics.push(metric) : undefined;

  const earlier = rasterImage(job.width, job.height, job.earlier);
  const newer = rasterImage(job.width, job.height, job.newer);
  const translation = job.alignByTranslation
    ? alignByTranslation(earlier, newer, undefined, sink)
    : { image: newer, dx: 0, dy: 0 };
  const alignedNewer = translation.image;

  const result = diffImages(earlier, alignedNewer, {
    threshold: job.threshold,
    includeAA: job.includeAA,
    addedColor: job.addedColor,
    removedColor: job.removedColor,
    modifiedColor: job.modifiedColor,
    unchangedOpacity: job.unchangedOpacity,
    regionOptions: job.regionOptions,
    metrics: sink,
  });

  const layers: OverlayLayers | undefined = job.withLayers
    ? overlayLayers(earlier, alignedNewer, result.directionMask)
    : undefined;

  return {
    earlier: earlier.data.buffer as ArrayBuffer,
    newer: alignedNewer.data.buffer as ArrayBuffer,
    dx: translation.dx,
    dy: translation.dy,
    changedPixels: result.changedPixels,
    changedPercent: result.changedPercent,
    overlay: result.overlay.data.buffer as ArrayBuffer,
    regions: result.regions,
    layers: layers && {
      base: layers.base.data.buffer as ArrayBuffer,
      added: layers.added.data.buffer as ArrayBuffer,
      removed: layers.removed.data.buffer as ArrayBuffer,
      modified: layers.modified.data.buffer as ArrayBuffer,
    },
    metrics,
  };
}
