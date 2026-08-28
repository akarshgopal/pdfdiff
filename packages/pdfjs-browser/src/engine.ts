import {
  alignByTranslation,
  diffImages,
  diffSemanticPages,
  throwIfAborted,
  type ComparisonPage,
  type ComparisonResult,
  type DiffEngine,
  type DiffOptions,
  type DiffPolicy,
  type PageText,
  type RasterImage,
} from "@pdfdiff/core";
import { extractPageText } from "./text.js";
import { loadPdfPair } from "./pdf.js";
import { renderPage, renderPagePair } from "./render.js";
import type { LoadedPdf, PdfSource, RenderedPage } from "./types.js";

const PREVIEW_SCALE = 2;
const DEFAULT_POLICY: Required<DiffPolicy> = {
  maxPixels: 3_000_000,
  maxDimension: 2800,
  regionMinPixels: 8,
  maxRegions: 80,
};
const ADDED_PAGE_THRESHOLD = 0.08;

type ComparisonPolicy = Required<DiffPolicy>;

function comparisonPolicy(options: DiffOptions): ComparisonPolicy {
  return { ...DEFAULT_POLICY, ...options.policy };
}

function comparisonThreshold(sensitivity: number): number {
  return Math.max(0.025, 0.18 - sensitivity * 0.00145);
}

function yieldToBrowser(signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function imageDataFromRaster(image: RasterImage): ImageData {
  return new ImageData(image.data as ImageDataArray, image.width, image.height);
}

function blankImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  return new ImageData(data, width, height);
}

function asRenderedPage(page: RenderedPage, imageData: ImageData): RenderedPage {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d", { alpha: false })?.putImageData(imageData, 0, 0);
  return { ...page, data: imageData.data, imageData, canvas };
}

function emptyPageText(pageNumber: number, page: RenderedPage): PageText {
  return { pageNumber, width: page.widthPoints, height: page.heightPoints, items: [], text: "", hasText: false };
}

function geometryForPage(page: RenderedPage, width: number, height: number, shiftX = 0, shiftY = 0) {
  return { widthPoints: page.widthPoints, heightPoints: page.heightPoints, scale: page.scale, offsetX: (width - page.width) / 2 + shiftX, offsetY: (height - page.height) / 2 + shiftY };
}

async function compareExistingPage(earlier: LoadedPdf, newer: LoadedPdf, pageNumber: number, options: DiffOptions, policy: ComparisonPolicy, signal: AbortSignal): Promise<ComparisonPage> {
  const rendered = await renderPagePair(earlier, newer, pageNumber, pageNumber, { scale: PREVIEW_SCALE, maxPixels: policy.maxPixels, maxDimension: policy.maxDimension, includeAnnotations: true, signal });
  await yieldToBrowser(signal);
  const translation = options.alignment === "translation" ? alignByTranslation(rendered.earlier, rendered.newer, signal) : { image: rendered.newer, dx: 0, dy: 0 };
  const alignedNewer = translation.image === rendered.newer ? rendered.newer : asRenderedPage(rendered.newer, imageDataFromRaster(translation.image));
  await yieldToBrowser(signal);
  const result = diffImages(rendered.earlier, alignedNewer, { threshold: comparisonThreshold(options.sensitivity), includeAA: false, unchangedOpacity: 0.24, regionOptions: { minPixels: policy.regionMinPixels, maxRegions: policy.maxRegions, connectivity: 8 }, signal });
  const [oldText, newText] = await Promise.all([extractPageText(earlier, pageNumber, { signal }), extractPageText(newer, pageNumber, { signal })]);
  const semantic = diffSemanticPages(oldText, newText, { signal });
  return {
    index: pageNumber - 1,
    width: result.width,
    height: result.height,
    status: result.changedPixels === 0 && semantic.changes.length === 0 ? "same" : "changed",
    earlier: rendered.earlier,
    newer: alignedNewer,
    diff: result.overlay,
    changedPixels: result.changedPixels,
    changedPercent: result.changedPercent,
    regions: result.regions,
    semantic,
    visualGeometry: { earlier: geometryForPage(rendered.earlier, result.width, result.height), newer: geometryForPage(rendered.newer, result.width, result.height, translation.dx, translation.dy) },
  };
}

async function compareMissingPage(document: LoadedPdf, pageNumber: number, hasEarlier: boolean, policy: ComparisonPolicy, signal: AbortSignal): Promise<ComparisonPage> {
  const rendered = await renderPage(document, pageNumber, { scale: PREVIEW_SCALE, maxPixels: policy.maxPixels, maxDimension: policy.maxDimension, signal });
  await yieldToBrowser(signal);
  const blank = blankImage(rendered.width, rendered.height);
  const oldImage: RasterImage = hasEarlier ? rendered : { width: rendered.width, height: rendered.height, data: blank.data };
  const newImage: RasterImage = hasEarlier ? { width: rendered.width, height: rendered.height, data: blank.data } : rendered;
  const result = diffImages(oldImage, newImage, { threshold: ADDED_PAGE_THRESHOLD, includeAA: true, regionOptions: { minPixels: policy.regionMinPixels, maxRegions: Math.min(policy.maxRegions, 40) }, signal });
  const pageText = await extractPageText(document, pageNumber, { signal });
  const semantic = hasEarlier ? diffSemanticPages(pageText, emptyPageText(pageNumber, rendered), { signal }) : diffSemanticPages(emptyPageText(pageNumber, rendered), pageText, { signal });
  return {
    index: pageNumber - 1,
    width: result.width,
    height: result.height,
    status: hasEarlier ? "removed" : "added",
    earlier: oldImage,
    newer: newImage,
    diff: result.overlay,
    changedPixels: result.changedPixels,
    changedPercent: result.changedPercent,
    regions: result.regions,
    semantic,
    visualGeometry: hasEarlier ? { earlier: geometryForPage(rendered, result.width, result.height) } : { newer: geometryForPage(rendered, result.width, result.height) },
  };
}

async function comparePdfPair(earlier: PdfSource, newer: PdfSource, options: DiffOptions, signal: AbortSignal, workerSrc: string, onProgress?: (progress: { completed: number; total: number }) => void): Promise<ComparisonResult> {
  const startedAt = performance.now();
  const pair = await loadPdfPair(earlier, newer, { signal, workerSrc });
  const totalPages = Math.max(pair.earlier.pageCount, pair.newer.pageCount);
  const policy = comparisonPolicy(options);
  const pages: ComparisonPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      throwIfAborted(signal);
      const hasEarlier = pageNumber <= pair.earlier.pageCount;
      const hasNewer = pageNumber <= pair.newer.pageCount;
      const page = hasEarlier && hasNewer
        ? await compareExistingPage(pair.earlier, pair.newer, pageNumber, options, policy, signal)
        : await compareMissingPage(hasEarlier ? pair.earlier : pair.newer, pageNumber, hasEarlier, policy, signal);
      pages.push(page);
      onProgress?.({ completed: pageNumber, total: totalPages });
    }

    return { earlierName: "name" in earlier ? earlier.name : undefined, newerName: "name" in newer ? newer.name : undefined, pages, elapsedMs: Math.round(performance.now() - startedAt) };
  } finally {
    await Promise.allSettled([pair.earlier.destroy(), pair.newer.destroy()]);
  }
}

export interface PdfJsEngineOptions {
  /** URL for the PDF.js worker emitted by the host bundler. */
  workerSrc: string;
}

export function createPdfJsEngine({ workerSrc }: PdfJsEngineOptions): DiffEngine<PdfSource, AbortSignal> {
  return { compare: ({ earlier, newer, options, signal, onProgress }) => comparePdfPair(earlier, newer, options, signal, workerSrc, onProgress) };
}
