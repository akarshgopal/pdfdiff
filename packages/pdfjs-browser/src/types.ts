import type { PDFDocumentProxy } from "pdfjs-dist";
import type {
  DiffMetricSink,
  PageText,
  ProgressEvent,
  RenderedPage as CoreRenderedPage,
} from "@pdfdiff/core";

export type PdfSource = File | ArrayBuffer | Uint8Array;

export interface PdfLoadOptions {
  signal?: AbortSignal;
  metrics?: DiffMetricSink;
  workerSrc?: string;
}

export interface LoadedPdf {
  readonly pdf: PDFDocumentProxy;
  readonly name?: string;
  readonly byteLength: number;
  readonly pageCount: number;
  readonly fingerprint: string | null;
  destroy(): Promise<void>;
}

export interface RenderOptions {
  scale?: number;
  maxPixels?: number;
  maxDimension?: number;
  signal?: AbortSignal;
  metrics?: DiffMetricSink;
}

export interface DocumentTextOptions {
  signal?: AbortSignal;
  onProgress?: (event: ProgressEvent) => void;
  metrics?: DiffMetricSink;
}

export interface RenderedPage extends CoreRenderedPage {
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

export type { PageText };
