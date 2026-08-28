import {
  alignByTranslation,
  diffImages,
  diffSemanticPages,
  type ComparisonPage,
  type ComparisonResult,
  type DiffEngine,
  type DiffOptions,
  type PageText,
  type RasterImage,
} from "@pdfdiff/core";
import { extractPageText } from "./text.js";
import { loadPdfPair } from "./pdf.js";
import { renderPage, renderPagePair } from "./render.js";
import type { PdfSource, RenderedPage } from "./types.js";

const MAX_COMPARISON_PIXELS = 3_000_000;
const PREVIEW_SCALE = 2;

function imageDataFromRaster(image: RasterImage): ImageData {
  return new ImageData(image.data as ImageDataArray, image.width, image.height);
}

function blankImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  return new ImageData(data, width, height);
}

function asRenderedPage(page: RenderedPage, imageData: ImageData): RenderedPage {
  return {
    ...page,
    data: imageData.data,
    imageData,
    canvas: (() => {
      const canvas = document.createElement("canvas");
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      canvas.getContext("2d", { alpha: false })?.putImageData(imageData, 0, 0);
      return canvas;
    })(),
  };
}

function emptyPageText(pageNumber: number, page: RenderedPage): PageText {
  return {
    pageNumber,
    width: page.widthPoints,
    height: page.heightPoints,
    items: [],
    text: "",
    hasText: false,
  };
}

function geometryForPage(page: RenderedPage, width: number, height: number, shiftX = 0, shiftY = 0) {
  return {
    widthPoints: page.widthPoints,
    heightPoints: page.heightPoints,
    scale: page.scale,
    offsetX: (width - page.width) / 2 + shiftX,
    offsetY: (height - page.height) / 2 + shiftY,
  };
}

async function comparePdfPair(
  earlier: PdfSource,
  newer: PdfSource,
  options: DiffOptions,
  signal: AbortSignal,
  workerSrc: string,
  onProgress?: (progress: { completed: number; total: number }) => void,
): Promise<ComparisonResult> {
  const startedAt = performance.now();
  const pair = await loadPdfPair(earlier, newer, { signal, workerSrc });
  const totalPages = Math.max(pair.earlier.pageCount, pair.newer.pageCount);
  const pages: ComparisonPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      if (signal.aborted) throw new DOMException("Comparison cancelled.", "AbortError");
      const hasEarlier = pageNumber <= pair.earlier.pageCount;
      const hasNewer = pageNumber <= pair.newer.pageCount;

      if (hasEarlier && hasNewer) {
        const rendered = await renderPagePair(pair.earlier, pair.newer, pageNumber, pageNumber, {
          scale: PREVIEW_SCALE,
          maxPixels: MAX_COMPARISON_PIXELS,
          maxDimension: 2800,
          includeAnnotations: true,
          signal,
        });
        const translation = options.alignment === "translation"
          ? alignByTranslation(rendered.earlier, rendered.newer, signal)
          : { image: rendered.newer, dx: 0, dy: 0 };
        const alignedNewer = translation.image === rendered.newer
          ? rendered.newer
          : asRenderedPage(rendered.newer, imageDataFromRaster(translation.image));
        const result = diffImages(rendered.earlier, alignedNewer, {
          threshold: Math.max(0.025, 0.18 - options.sensitivity * 0.00145),
          includeAA: false,
          unchangedOpacity: 0.24,
          regionOptions: { minPixels: 8, maxRegions: 80, connectivity: 8 },
          signal,
        });
        const [oldText, newText] = await Promise.all([
          extractPageText(pair.earlier, pageNumber, { signal }),
          extractPageText(pair.newer, pageNumber, { signal }),
        ]);
        const semantic = diffSemanticPages(oldText, newText, { signal });
        pages.push({
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
          visualGeometry: {
            earlier: geometryForPage(rendered.earlier, result.width, result.height),
            newer: geometryForPage(rendered.newer, result.width, result.height, translation.dx, translation.dy),
          },
        });
      } else {
        const document = hasEarlier ? pair.earlier : pair.newer;
        const rendered = await renderPage(document, pageNumber, {
          scale: PREVIEW_SCALE,
          maxPixels: MAX_COMPARISON_PIXELS,
          maxDimension: 2800,
          signal,
        });
        const blank = blankImage(rendered.width, rendered.height);
        const oldImage: RasterImage = hasEarlier ? rendered : { width: rendered.width, height: rendered.height, data: blank.data };
        const newImage: RasterImage = hasNewer ? rendered : { width: rendered.width, height: rendered.height, data: blank.data };
        const result = diffImages(oldImage, newImage, {
          threshold: 0.08,
          includeAA: true,
          regionOptions: { minPixels: 8, maxRegions: 40 },
          signal,
        });
        const pageText = await extractPageText(document, pageNumber, { signal });
        const semantic = hasEarlier
          ? diffSemanticPages(pageText, emptyPageText(pageNumber, rendered), { signal })
          : diffSemanticPages(emptyPageText(pageNumber, rendered), pageText, { signal });
        pages.push({
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
          visualGeometry: {
            ...(hasEarlier ? { earlier: geometryForPage(rendered, result.width, result.height) } : {}),
            ...(hasNewer ? { newer: geometryForPage(rendered, result.width, result.height) } : {}),
          },
        });
      }
      onProgress?.({ completed: pageNumber, total: totalPages });
    }

    return {
      earlierName: "name" in earlier ? earlier.name : undefined,
      newerName: "name" in newer ? newer.name : undefined,
      pages,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    await Promise.allSettled([pair.earlier.destroy(), pair.newer.destroy()]);
  }
}

export interface PdfJsEngineOptions {
  /** URL for the PDF.js worker emitted by the host bundler. */
  workerSrc: string;
}

export function createPdfJsEngine({ workerSrc }: PdfJsEngineOptions): DiffEngine<PdfSource> {
  return {
    compare: ({ earlier, newer, options, signal, onProgress }) =>
      comparePdfPair(earlier, newer, options, signal as AbortSignal, workerSrc, onProgress),
  };
}
