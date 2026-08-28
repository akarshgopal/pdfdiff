import { AnnotationMode, type PDFPageProxy } from "pdfjs-dist";
import { PdfDiffAbortError, throwIfAborted } from "@pdfdiff/core";
import type { LoadedPdf, RenderOptions, RenderedPage, RenderedPagePair } from "./types.js";

const DEFAULT_SCALE = 1.5;
const DEFAULT_MAX_PIXELS = 8_000_000;
const DEFAULT_MAX_DIMENSION = 4096;

function positiveOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function pageFor(pdf: LoadedPdf, pageNumber: number): Promise<PDFPageProxy> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.pageCount) {
    return Promise.reject(new RangeError(`Page ${pageNumber} is outside the document's 1-${pdf.pageCount} range.`));
  }
  return pdf.pdf.getPage(pageNumber);
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser does not provide a 2D canvas context.");
  return context;
}

async function renderIntoCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  widthPoints: number,
  heightPoints: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  options: RenderOptions,
): Promise<RenderedPage> {
  throwIfAborted(options.signal);
  const rotation = page.rotate;
  const viewport = page.getViewport({ scale, rotation });
  const context = createContext(canvas);
  const background = options.background ?? "rgb(255, 255, 255)";
  context.save();
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();

  const renderTask = page.render({
    canvas,
    canvasContext: context,
    viewport,
    transform: [1, 0, 0, 1, offsetX, offsetY],
    background,
    annotationMode: options.includeAnnotations === false ? AnnotationMode.DISABLE : AnnotationMode.ENABLE,
  });
  const signal = options.signal as AbortSignal | undefined;
  const onAbort = (): void => renderTask.cancel();
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  try {
    await renderTask.promise;
    throwIfAborted(options.signal);
  } catch (error) {
    if (signal?.aborted) throw new PdfDiffAbortError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    pageNumber: page.pageNumber,
    width: canvas.width,
    height: canvas.height,
    data: imageData.data,
    widthPoints,
    heightPoints,
    rotation,
    scale,
    canvas,
    imageData,
  };
}

/** Render one page into a bounded canvas. */
export async function renderPage(pdf: LoadedPdf, pageNumber: number, options: RenderOptions = {}): Promise<RenderedPage> {
  throwIfAborted(options.signal);
  const page = await pageFor(pdf, pageNumber);
  throwIfAborted(options.signal);
  const baseViewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const requestedScale = positiveOr(options.scale, DEFAULT_SCALE);
  const maxPixels = positiveOr(options.maxPixels, DEFAULT_MAX_PIXELS);
  const maxDimension = positiveOr(options.maxDimension, DEFAULT_MAX_DIMENSION);
  const pixelScale = Math.sqrt(maxPixels / (baseViewport.width * baseViewport.height));
  const dimensionScale = maxDimension / Math.max(baseViewport.width, baseViewport.height);
  const scale = Math.max(0.01, Math.min(requestedScale, pixelScale, dimensionScale));
  const width = Math.max(1, Math.ceil(baseViewport.width * scale));
  const height = Math.max(1, Math.ceil(baseViewport.height * scale));
  const canvas = createCanvas(width, height);
  return renderIntoCanvas(page, canvas, baseViewport.width, baseViewport.height, scale, 0, 0, options);
}

/** Render corresponding pages onto one normalized pixel grid. */
export async function renderPagePair(
  earlier: LoadedPdf,
  newer: LoadedPdf,
  earlierPageNumber: number,
  newerPageNumber: number,
  options: RenderOptions = {},
): Promise<RenderedPagePair> {
  throwIfAborted(options.signal);
  const [earlierPage, newerPage] = await Promise.all([
    pageFor(earlier, earlierPageNumber),
    pageFor(newer, newerPageNumber),
  ]);
  throwIfAborted(options.signal);
  const earlierViewport = earlierPage.getViewport({ scale: 1, rotation: earlierPage.rotate });
  const newerViewport = newerPage.getViewport({ scale: 1, rotation: newerPage.rotate });
  const widthPoints = Math.max(earlierViewport.width, newerViewport.width);
  const heightPoints = Math.max(earlierViewport.height, newerViewport.height);
  const requestedScale = positiveOr(options.scale, DEFAULT_SCALE);
  const maxPixels = positiveOr(options.maxPixels, DEFAULT_MAX_PIXELS);
  const maxDimension = positiveOr(options.maxDimension, DEFAULT_MAX_DIMENSION);
  const pixelScale = Math.sqrt(maxPixels / (widthPoints * heightPoints));
  const dimensionScale = maxDimension / Math.max(widthPoints, heightPoints);
  const scale = Math.max(0.01, Math.min(requestedScale, pixelScale, dimensionScale));
  const width = Math.max(1, Math.ceil(widthPoints * scale));
  const height = Math.max(1, Math.ceil(heightPoints * scale));
  const background = options.background ?? "rgb(255, 255, 255)";
  const renderOptions = { ...options, background };
  const earlierCanvas = createCanvas(width, height);
  const newerCanvas = createCanvas(width, height);
  const earlierOffsetX = (width - earlierViewport.width * scale) / 2;
  const earlierOffsetY = (height - earlierViewport.height * scale) / 2;
  const newerOffsetX = (width - newerViewport.width * scale) / 2;
  const newerOffsetY = (height - newerViewport.height * scale) / 2;
  const [earlierRendered, newerRendered] = await Promise.all([
    renderIntoCanvas(earlierPage, earlierCanvas, earlierViewport.width, earlierViewport.height, scale, earlierOffsetX, earlierOffsetY, renderOptions),
    renderIntoCanvas(newerPage, newerCanvas, newerViewport.width, newerViewport.height, scale, newerOffsetX, newerOffsetY, renderOptions),
  ]);
  return { earlier: earlierRendered, newer: newerRendered, width, height, scale };
}
