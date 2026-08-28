export interface RasterImage {
  readonly width: number;
  readonly height: number;
  /** RGBA pixels in row-major order; transfer the backing ArrayBuffer between workers. */
  readonly data: Uint8ClampedArray;
}

/** Minimal cancellation contract so the core stays independent of DOM types. */
export interface AbortSignalLike {
  readonly aborted: boolean;
}

export interface ProgressEvent {
  completed: number;
  total: number;
}

export interface RenderedPage extends RasterImage {
  readonly pageNumber: number;
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly rotation: number;
  readonly scale: number;
}

export interface RenderedPagePair {
  readonly earlier: RenderedPage;
  readonly newer: RenderedPage;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export type RgbColor = readonly [number, number, number];

export interface VisualDiffOptions {
  threshold?: number;
  includeAA?: boolean;
  addedColor?: RgbColor;
  removedColor?: RgbColor;
  unchangedOpacity?: number;
  regionOptions?: RegionOptions;
  signal?: AbortSignalLike;
}

export interface VisualDiffResult {
  readonly width: number;
  readonly height: number;
  readonly changedPixels: number;
  readonly changedPercent: number;
  readonly changedMask: Uint8Array;
  readonly directionMask: Uint8Array;
  readonly overlay: RasterImage;
  readonly addedPixels: number;
  readonly removedPixels: number;
  readonly regions: readonly ChangeRegion[];
}

export interface ChangeRegion {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly area: number;
}

export interface RegionOptions {
  minPixels?: number;
  maxRegions?: number;
  connectivity?: 4 | 8;
  signal?: AbortSignalLike;
}

export interface TextBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextPoint {
  readonly x: number;
  readonly y: number;
}

export type TextQuad = readonly [TextPoint, TextPoint, TextPoint, TextPoint];

export interface PositionedTextItem {
  readonly pageNumber: number;
  readonly str: string;
  readonly textStart: number;
  readonly textEnd: number;
  readonly dir: string;
  readonly fontName: string;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly hasEOL: boolean;
  readonly transform: readonly number[];
  readonly bounds: TextBounds;
  readonly quad: TextQuad;
}

export interface PageText {
  readonly pageNumber: number;
  readonly width: number;
  readonly height: number;
  readonly items: readonly PositionedTextItem[];
  readonly text: string;
  readonly hasText: boolean;
}

export type PageStatus = "same" | "changed" | "added" | "removed" | "processing" | "error";

export type AlignmentMode = "none" | "translation";

export interface DiffOptions {
  readonly sensitivity: number;
  readonly alignment: AlignmentMode;
  readonly policy?: DiffPolicy;
}

/** Optional resource and region limits applied by an adapter during comparison. */
export interface DiffPolicy {
  readonly maxPixels?: number;
  readonly maxDimension?: number;
  readonly regionMinPixels?: number;
  readonly maxRegions?: number;
}

export interface VisualPageGeometry {
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Runtime-neutral result for one compared page. */
export interface ComparisonPage {
  readonly index: number;
  readonly width?: number;
  readonly height?: number;
  readonly status?: PageStatus;
  readonly earlier?: RasterImage;
  readonly newer?: RasterImage;
  readonly diff?: RasterImage;
  readonly changedPixels?: number;
  readonly changedPercent?: number;
  readonly regions?: readonly ChangeRegion[];
  readonly semantic?: import("./semantic.js").SemanticPageDiff;
  readonly visualGeometry?: {
    readonly earlier?: VisualPageGeometry;
    readonly newer?: VisualPageGeometry;
  };
  readonly error?: string;
}

export interface ComparisonResult {
  readonly earlierName?: string;
  readonly newerName?: string;
  readonly pages: readonly ComparisonPage[];
  readonly elapsedMs?: number;
}

export interface DiffEngine<Source, Signal extends AbortSignalLike = AbortSignalLike> {
  compare(request: {
    earlier: Source;
    newer: Source;
    options: DiffOptions;
    signal: Signal;
    onProgress?: (progress: ProgressEvent) => void;
  }): Promise<ComparisonResult>;
}
