import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type {
  AbortSignalLike,
  PageText,
  ProgressEvent,
  RenderedPage as CoreRenderedPage,
} from "@pdfdiff/core";

export type PdfSource = File | ArrayBuffer | Uint8Array;

export interface PdfLoadOptions {
  signal?: AbortSignalLike;
  onProgress?: (loaded: number, total?: number) => void;
  password?: string;
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

export interface RenderOptions {
  scale?: number;
  maxPixels?: number;
  maxDimension?: number;
  includeAnnotations?: boolean;
  background?: string;
  signal?: AbortSignalLike;
}

export interface DocumentTextOptions {
  signal?: AbortSignalLike;
  onProgress?: (event: ProgressEvent) => void;
  includeMarkedContent?: boolean;
  disableNormalization?: boolean;
}

export type PdfPage = PDFPageProxy;
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
