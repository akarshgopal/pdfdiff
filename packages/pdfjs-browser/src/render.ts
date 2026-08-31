import { AnnotationMode, type PDFPageProxy } from "pdfjs-dist";
import { measureAsync, PdfDiffAbortError, throwIfAborted } from "@pdfdiff/core";
import type { LoadedPdf, RenderOptions, RenderedPage, RenderedPagePair } from "./types.js";

const BACKGROUND = "rgb(255, 255, 255)";
const DEFAULT_SCALE = 1.5;
const DEFAULT_MAX_PIXELS = 8_000_000;
const DEFAULT_MAX_DIMENSION = 4096;

interface RenderBounds {
  width: number;
  height: number;
  scale: number;
}

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

function boundedRenderSize(widthPoints: number, heightPoints: number, options: RenderOptions): RenderBounds {
  const requestedScale = positiveOr(options.scale, DEFAULT_SCALE);
  const pixelScale = Math.sqrt(positiveOr(options.maxPixels, DEFAULT_MAX_PIXELS) / (widthPoints * heightPoints));
  const dimensionScale = positiveOr(options.maxDimension, DEFAULT_MAX_DIMENSION) / Math.max(widthPoints, heightPoints);
  const scale = Math.max(0.01, Math.min(requestedScale, pixelScale, dimensionScale));
  return {
    width: Math.max(1, Math.ceil(widthPoints * scale)),
    height: Math.max(1, Math.ceil(heightPoints * scale)),
    scale,
  };
}

function beginPageRender(page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number, offsetX: number, offsetY: number) {
  const viewport = page.getViewport({ scale, rotation: page.rotate });
  const context = createContext(canvas);
  context.save();
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
  const renderTask = page.render({
    canvas,
    canvasContext: context,
    viewport,
    transform: [1, 0, 0, 1, offsetX, offsetY],
    background: BACKGROUND,
    annotationMode: AnnotationMode.ENABLE,
  });
  return { context, renderTask };
}

function watchRenderAbort(renderTask: { cancel: () => void }, signal?: AbortSignal): () => void {
  const onAbort = (): void => renderTask.cancel();
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  return () => signal?.removeEventListener("abort", onAbort);
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
  side?: "earlier" | "newer",
): Promise<RenderedPage> {
  throwIfAborted(options.signal);
  const rotation = page.rotate;
  const { context, renderTask } = beginPageRender(page, canvas, scale, offsetX, offsetY);
  const detachAbort = watchRenderAbort(renderTask, options.signal);
  try {
    await measureAsync(options.metrics, "pdf.render.canvas", async () => {
      await renderTask.promise;
      throwIfAborted(options.signal);
    }, {
      pageNumber: page.pageNumber,
      width: canvas.width,
      height: canvas.height,
      pixels: canvas.width * canvas.height,
      side: side ?? "single",
    });
  } catch (error) {
    if (options.signal?.aborted) throw new PdfDiffAbortError();
    throw error;
  } finally {
    detachAbort();
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;
  // The pixels now live in imageData; releasing the backing store here keeps a
  // long comparison from holding one full-size canvas per rendered page.
  canvas.width = 0;
  canvas.height = 0;
  return { pageNumber: page.pageNumber, width, height, data: imageData.data, widthPoints, heightPoints, rotation, scale };
}

/** Render one page into a bounded canvas. */
export async function renderPage(pdf: LoadedPdf, pageNumber: number, options: RenderOptions = {}): Promise<RenderedPage> {
  throwIfAborted(options.signal);
  const page = await pageFor(pdf, pageNumber);
  throwIfAborted(options.signal);
  const baseViewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const { width, height, scale } = boundedRenderSize(baseViewport.width, baseViewport.height, options);
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
  const { width, height, scale } = boundedRenderSize(widthPoints, heightPoints, options);
  const earlierCanvas = createCanvas(width, height);
  const newerCanvas = createCanvas(width, height);
  const earlierOffsetX = (width - earlierViewport.width * scale) / 2;
  const earlierOffsetY = (height - earlierViewport.height * scale) / 2;
  const newerOffsetX = (width - newerViewport.width * scale) / 2;
  const newerOffsetY = (height - newerViewport.height * scale) / 2;
  const [earlierRendered, newerRendered] = await Promise.all([
    renderIntoCanvas(earlierPage, earlierCanvas, earlierViewport.width, earlierViewport.height, scale, earlierOffsetX, earlierOffsetY, options, "earlier"),
    renderIntoCanvas(newerPage, newerCanvas, newerViewport.width, newerViewport.height, scale, newerOffsetX, newerOffsetY, options, "newer"),
  ]);
  return { earlier: earlierRendered, newer: newerRendered, width, height, scale };
}
