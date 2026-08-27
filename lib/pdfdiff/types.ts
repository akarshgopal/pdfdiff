import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

/** A value that can be read without uploading it anywhere. */
export type PdfSource = File | ArrayBuffer | Uint8Array;

export interface PdfLoadOptions {
  signal?: AbortSignal;
  /** Called with PDF.js's byte progress while the document is loading. */
  onProgress?: (loaded: number, total?: number) => void;
  /** Optional password passed to PDF.js for encrypted documents. */
  password?: string;
}

export interface PdfMetadata {
  pageCount: number;
  fingerprint: string | null;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
}

export interface LoadedPdf {
  readonly pdf: PDFDocumentProxy;
  readonly name?: string;
  readonly byteLength: number;
  readonly pageCount: number;
  readonly fingerprint: string | null;
  destroy(): Promise<void>;
}

export interface ProgressEvent {
  completed: number;
  total: number;
}

export interface RenderOptions {
  /** Requested CSS pixels per PDF point. Defaults to 1.5. */
  scale?: number;
  /** Upper bound for the shared normalized canvas area. Defaults to 8 million pixels. */
  maxPixels?: number;
  /** Upper bound for either normalized canvas dimension. Defaults to 4096 pixels. */
  maxDimension?: number;
  /** Render page annotations when true. Defaults to true. */
  includeAnnotations?: boolean;
  /** Background used for transparent page content. Defaults to opaque white. */
  background?: string;
  signal?: AbortSignal;
}

export interface RenderedPage {
  readonly pageNumber: number;
  readonly width: number;
  readonly height: number;
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly rotation: number;
  readonly scale: number;
  /** The canvas is useful for direct display and remains local to the browser. */
  readonly canvas: HTMLCanvasElement;
  readonly imageData: ImageData;
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
  /** Pixelmatch threshold in the range 0..1. Defaults to 0.1. */
  threshold?: number;
  /** Include antialiased pixels in the result. Defaults to false. */
  includeAA?: boolean;
  /** Color used for pixels present only in the newer document. */
  addedColor?: RgbColor;
  /** Color used for pixels present only in the earlier document. */
  removedColor?: RgbColor;
  /** Unchanged image brightness in the neutral overlay, 0..1. Defaults to 0.25. */
  unchangedOpacity?: number;
  regionOptions?: RegionOptions;
  signal?: AbortSignal;
}

export interface VisualDiffResult {
  readonly width: number;
  readonly height: number;
  /** Number of changed pixels after pixelmatch's threshold/AA filtering. */
  readonly changedPixels: number;
  /** changedPixels / (width * height), expressed as a percentage. */
  readonly changedPercent: number;
  /** One byte per pixel: 1 = changed, 0 = unchanged. */
  readonly changedMask: Uint8Array;
  /** One byte per pixel: 1 = added/new, 2 = removed/old, 3 = both/other. */
  readonly directionMask: Uint8Array;
  /** Grayscale unchanged pixels with red/cyan directional differences. */
  readonly overlay: ImageData;
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
  /** Number of changed pixels in this connected component. */
  readonly pixelCount: number;
  /** Bounding-box area in pixels. */
  readonly area: number;
}

export interface RegionOptions {
  minPixels?: number;
  maxRegions?: number;
  connectivity?: 4 | 8;
  signal?: AbortSignal;
}

export interface TextBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PositionedTextItem {
  readonly pageNumber: number;
  readonly str: string;
  readonly dir: string;
  readonly fontName: string;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly hasEOL: boolean;
  /** PDF.js transform [a, b, c, d, e, f] in page coordinates. */
  readonly transform: readonly number[];
  /** Bounds in the page's unscaled, rotated viewport coordinate system. */
  readonly bounds: TextBounds;
}

export interface PageText {
  readonly pageNumber: number;
  readonly items: readonly PositionedTextItem[];
  readonly text: string;
  readonly hasText: boolean;
}

export interface DocumentTextOptions {
  signal?: AbortSignal;
  onProgress?: (event: ProgressEvent) => void;
  includeMarkedContent?: boolean;
  disableNormalization?: boolean;
}

export type PdfPage = PDFPageProxy;
