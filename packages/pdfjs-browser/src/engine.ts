import {
  alignByTranslation,
  alignPages,
  classifyRegions,
  fingerprintPage,
  diffImages,
  diffSemanticPages,
  measureAsync,
  throwIfAborted,
  type ComparisonPage,
  type AlignedPagePair,
  type ClassifierBox,
  type ComparisonReadyEvent,
  type PageAlignmentKind,
  type ComparisonResult,
  type DiffEngine,
  type DiffMetric,
  type DiffMetricSink,
  type DiffOptions,
  type DiffPolicy,
  type PageText,
  type RasterImage,
  type SemanticPageDiff,
  type TextQuad,
  type VisualPageGeometry,
} from "@pdfdiff/core";
import { extractPageText } from "./text.js";
import { loadPdfPair } from "./pdf.js";
import { renderPage, renderPagePair } from "./render.js";
import type { LoadedPdf, PdfSource, RenderedPage } from "./types.js";

const PREVIEW_SCALE = 2;
type MergeGapPolicy = Pick<DiffPolicy, "regionMergeGapX" | "regionMergeGapY">;

/** The merge gaps stay optional so an unset policy can derive them from the rendered page. */
const DEFAULT_POLICY: Required<Omit<DiffPolicy, keyof MergeGapPolicy>> = {
  maxPixels: 3_000_000,
  maxDimension: 2800,
  regionMinPixels: 8,
  maxRegions: 80,
};
const ADDED_PAGE_THRESHOLD = 0.08;

type ComparisonPolicy = Required<Omit<DiffPolicy, keyof MergeGapPolicy>> & MergeGapPolicy;

function comparisonPolicy(options: DiffOptions): ComparisonPolicy {
  return { ...DEFAULT_POLICY, ...options.policy };
}

/**
 * Changed pixels arrive one glyph at a time; these gaps rejoin a word or line
 * without pulling in the line below, and scale with the rendered page so the
 * behaviour holds for both letter pages and large-format drawings.
 */
function regionMergeGaps(policy: ComparisonPolicy, pageHeight: number): { mergeGapX: number; mergeGapY: number } {
  return {
    mergeGapX: policy.regionMergeGapX ?? Math.max(6, Math.round(pageHeight * 0.009)),
    mergeGapY: policy.regionMergeGapY ?? Math.max(2, Math.round(pageHeight * 0.0025)),
  };
}

function comparisonThreshold(sensitivity: number): number {
  return Math.max(0.025, 0.18 - sensitivity * 0.00145);
}

function sourceByteLength(source: PdfSource): number {
  if (typeof File !== "undefined" && source instanceof File) return source.size;
  if (source instanceof ArrayBuffer) return source.byteLength;
  return (source as Uint8Array).byteLength;
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

function pageMetricSink(sink: DiffMetricSink | undefined, pageNumber: number): DiffMetricSink | undefined {
  if (!sink) return undefined;
  return (metric: DiffMetric) => sink({
    ...metric,
    attributes: { pageNumber, ...metric.attributes },
  });
}

/** Text lives in PDF points; regions live in rendered pixels. Meet in pixels. */
function quadBox(quad: TextQuad, geometry: VisualPageGeometry): ClassifierBox {
  const xs = quad.map((point) => point.x * geometry.scale + geometry.offsetX);
  const ys = quad.map((point) => point.y * geometry.scale + geometry.offsetY);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function quadBoxes(quads: readonly TextQuad[], geometry: VisualPageGeometry | undefined): ClassifierBox[] {
  return geometry ? quads.map((quad) => quadBox(quad, geometry)) : [];
}

function classificationBoxes(semantic: SemanticPageDiff, geometry: { earlier?: VisualPageGeometry; newer?: VisualPageGeometry }) {
  const changedText = [
    ...semantic.beforeOverlays.flatMap((overlay) => quadBoxes(overlay.quads, geometry.earlier)),
    ...semantic.afterOverlays.flatMap((overlay) => quadBoxes(overlay.quads, geometry.newer)),
  ];
  const unchanged = semantic.unchangedLines ?? [];
  const movedText = unchanged.filter((line) => line.shifted).flatMap((line) => [
    ...quadBoxes(line.beforeQuads, geometry.earlier),
    ...quadBoxes(line.afterQuads, geometry.newer),
  ]);
  const staticText = unchanged.filter((line) => !line.shifted).flatMap((line) => quadBoxes(line.afterQuads, geometry.newer));
  return { changedText, movedText, staticText };
}

interface PageComparisonRequest {
  readonly earlier: LoadedPdf;
  readonly newer: LoadedPdf;
  readonly earlierPageNumber: number;
  readonly newerPageNumber: number;
  readonly index: number;
  readonly options: DiffOptions;
  readonly policy: ComparisonPolicy;
  readonly signal: AbortSignal;
  readonly earlierText?: PageText;
  readonly newerText?: PageText;
  readonly alignment?: PageAlignmentKind;
  readonly similarity?: number;
  readonly metrics?: DiffMetricSink;
}

async function pageTextFor(cached: PageText | undefined, document: LoadedPdf, pageNumber: number, signal: AbortSignal, metrics?: DiffMetricSink): Promise<PageText> {
  return cached ?? await extractPageText(document, pageNumber, { signal, metrics });
}

async function compareExistingPage(request: PageComparisonRequest): Promise<ComparisonPage> {
  const { earlier, newer, earlierPageNumber, newerPageNumber, options, policy, signal, metrics } = request;
  const rendered = await renderPagePair(earlier, newer, earlierPageNumber, newerPageNumber, { scale: PREVIEW_SCALE, maxPixels: policy.maxPixels, maxDimension: policy.maxDimension, includeAnnotations: true, signal, metrics });
  await yieldToBrowser(signal);
  const translation = options.alignment === "translation" ? alignByTranslation(rendered.earlier, rendered.newer, signal, metrics) : { image: rendered.newer, dx: 0, dy: 0 };
  const alignedNewer = translation.image === rendered.newer ? rendered.newer : asRenderedPage(rendered.newer, imageDataFromRaster(translation.image));
  await yieldToBrowser(signal);
  const result = diffImages(rendered.earlier, alignedNewer, { threshold: comparisonThreshold(options.sensitivity), includeAA: false, unchangedOpacity: 0.24, regionOptions: { minPixels: policy.regionMinPixels, maxRegions: policy.maxRegions, connectivity: 8, readingOrder: true, ...regionMergeGaps(policy, rendered.earlier.height) }, signal, metrics });
  const [oldText, newText] = await Promise.all([
    pageTextFor(request.earlierText, earlier, earlierPageNumber, signal, metrics),
    pageTextFor(request.newerText, newer, newerPageNumber, signal, metrics),
  ]);
  const semantic = diffSemanticPages(oldText, newText, { signal, metrics });
  const visualGeometry = { earlier: geometryForPage(rendered.earlier, result.width, result.height), newer: geometryForPage(rendered.newer, result.width, result.height, translation.dx, translation.dy) };
  const classification = classifyRegions({ regions: result.regions, ...classificationBoxes(semantic, visualGeometry) });
  return {
    index: request.index,
    earlierPageNumber,
    newerPageNumber,
    alignment: request.alignment ?? "matched",
    similarity: request.similarity,
    width: result.width,
    height: result.height,
    status: result.changedPixels === 0 && semantic.changes.length === 0 ? "same" : "changed",
    earlier: rendered.earlier,
    newer: alignedNewer,
    diff: result.overlay,
    changedPixels: result.changedPixels,
    changedPercent: result.changedPercent,
    regions: classification.regions,
    changeClasses: classification.counts,
    noticeable: classification.noticeable,
    semantic,
    visualGeometry,
  };
}

interface MissingPageRequest {
  readonly document: LoadedPdf;
  readonly pageNumber: number;
  readonly index: number;
  readonly hasEarlier: boolean;
  readonly policy: ComparisonPolicy;
  readonly signal: AbortSignal;
  readonly pageText?: PageText;
  readonly metrics?: DiffMetricSink;
}

async function compareMissingPage(request: MissingPageRequest): Promise<ComparisonPage> {
  const { document, pageNumber, hasEarlier, policy, signal, metrics } = request;
  const rendered = await renderPage(document, pageNumber, { scale: PREVIEW_SCALE, maxPixels: policy.maxPixels, maxDimension: policy.maxDimension, signal, metrics });
  await yieldToBrowser(signal);
  const blank = blankImage(rendered.width, rendered.height);
  const oldImage: RasterImage = hasEarlier ? rendered : { width: rendered.width, height: rendered.height, data: blank.data };
  const newImage: RasterImage = hasEarlier ? { width: rendered.width, height: rendered.height, data: blank.data } : rendered;
  const result = diffImages(oldImage, newImage, { threshold: ADDED_PAGE_THRESHOLD, includeAA: true, regionOptions: { minPixels: policy.regionMinPixels, maxRegions: Math.min(policy.maxRegions, 40), readingOrder: true, ...regionMergeGaps(policy, rendered.height) }, signal, metrics });
  const pageText = await pageTextFor(request.pageText, document, pageNumber, signal, metrics);
  const semantic = hasEarlier ? diffSemanticPages(pageText, emptyPageText(pageNumber, rendered), { signal, metrics }) : diffSemanticPages(emptyPageText(pageNumber, rendered), pageText, { signal, metrics });
  return {
    index: request.index,
    earlierPageNumber: hasEarlier ? pageNumber : undefined,
    newerPageNumber: hasEarlier ? undefined : pageNumber,
    alignment: hasEarlier ? "removed" : "added",
    similarity: 0,
    width: result.width,
    height: result.height,
    status: hasEarlier ? "removed" : "added",
    earlier: hasEarlier ? rendered : undefined,
    newer: hasEarlier ? undefined : rendered,
    diff: result.overlay,
    changedPixels: result.changedPixels,
    changedPercent: result.changedPercent,
    regions: result.regions.map((region) => ({ ...region, changeClass: "content" as const })),
    changeClasses: { content: result.regions.length, reflow: 0, formatting: 0, graphic: 0 },
    noticeable: true,
    semantic,
    visualGeometry: hasEarlier ? { earlier: geometryForPage(rendered, result.width, result.height) } : { newer: geometryForPage(rendered, result.width, result.height) },
  };
}

/** Text drives both the page alignment and each page's semantic diff, so read it once. */
async function extractDocumentText(document: LoadedPdf, signal: AbortSignal, metrics?: DiffMetricSink): Promise<PageText[]> {
  const pages: PageText[] = [];
  for (let pageNumber = 1; pageNumber <= document.pageCount; pageNumber += 1) {
    throwIfAborted(signal);
    pages.push(await extractPageText(document, pageNumber, { signal, metrics }));
  }
  return pages;
}

function comparePairForAlignment(pair: AlignedPagePair, index: number, context: {
  earlier: LoadedPdf;
  newer: LoadedPdf;
  earlierText: readonly PageText[];
  newerText: readonly PageText[];
  options: DiffOptions;
  policy: ComparisonPolicy;
  signal: AbortSignal;
  metrics?: DiffMetricSink;
}): Promise<ComparisonPage> {
  const { earlier, newer, earlierText, newerText, options, policy, signal, metrics } = context;
  if (pair.earlierPageNumber !== undefined && pair.newerPageNumber !== undefined) {
    return compareExistingPage({
      earlier, newer, index, options, policy, signal, metrics,
      earlierPageNumber: pair.earlierPageNumber,
      newerPageNumber: pair.newerPageNumber,
      earlierText: earlierText[pair.earlierPageNumber - 1],
      newerText: newerText[pair.newerPageNumber - 1],
      alignment: pair.kind,
      similarity: pair.similarity,
    });
  }
  const hasEarlier = pair.earlierPageNumber !== undefined;
  const pageNumber = (hasEarlier ? pair.earlierPageNumber : pair.newerPageNumber)!;
  return compareMissingPage({
    document: hasEarlier ? earlier : newer,
    pageNumber, index, hasEarlier, policy, signal, metrics,
    pageText: (hasEarlier ? earlierText : newerText)[pageNumber - 1],
  });
}

async function comparePdfPair(
  earlier: PdfSource,
  newer: PdfSource,
  options: DiffOptions,
  signal: AbortSignal,
  workerSrc: string,
  onReady?: (event: ComparisonReadyEvent) => void | Promise<void>,
  onPage?: (page: ComparisonPage) => void | Promise<void>,
  onProgress?: (progress: { completed: number; total: number }) => void,
  onMetric?: DiffMetricSink,
): Promise<ComparisonResult> {
  const sourceAttributes = { earlierBytes: sourceByteLength(earlier), newerBytes: sourceByteLength(newer) };
  return measureAsync(onMetric, "comparison.total", async () => {
    const startedAt = performance.now();
    const pair = await measureAsync(onMetric, "pdf.load.pair", () => loadPdfPair(earlier, newer, { signal, workerSrc, metrics: onMetric }), sourceAttributes);
    const policy = comparisonPolicy(options);
    const pages: ComparisonPage[] = [];

    try {
      const [earlierText, newerText] = await measureAsync(onMetric, "comparison.text", () => Promise.all([
        extractDocumentText(pair.earlier, signal, onMetric),
        extractDocumentText(pair.newer, signal, onMetric),
      ]));
      const alignment = alignPages(
        earlierText.map((page) => fingerprintPage(page.text, page.pageNumber)),
        newerText.map((page) => fingerprintPage(page.text, page.pageNumber)),
        { signal, metrics: onMetric },
      );
      const totalPages = alignment.length;

      await onReady?.({
        earlierName: "name" in earlier ? earlier.name : undefined,
        newerName: "name" in newer ? newer.name : undefined,
        earlierPageCount: pair.earlier.pageCount,
        newerPageCount: pair.newer.pageCount,
        total: totalPages,
        alignment,
      });
      for (const [index, aligned] of alignment.entries()) {
        throwIfAborted(signal);
        const metrics = pageMetricSink(onMetric, aligned.newerPageNumber ?? aligned.earlierPageNumber ?? index + 1);
        const page = await measureAsync(onMetric, "comparison.page", () => comparePairForAlignment(aligned, index, {
          earlier: pair.earlier, newer: pair.newer, earlierText, newerText, options, policy, signal, metrics,
        }), {
          pageIndex: index,
          earlierPageNumber: aligned.earlierPageNumber ?? 0,
          newerPageNumber: aligned.newerPageNumber ?? 0,
          kind: aligned.kind,
        });
        pages.push(page);
        await onPage?.(page);
        onProgress?.({ completed: index + 1, total: totalPages });
      }

      return { earlierName: "name" in earlier ? earlier.name : undefined, newerName: "name" in newer ? newer.name : undefined, pages, alignment, elapsedMs: Math.round(performance.now() - startedAt) };
    } finally {
      await Promise.allSettled([pair.earlier.destroy(), pair.newer.destroy()]);
    }
  }, sourceAttributes);
}

async function comparePdfPagePair(earlier: PdfSource, newer: PdfSource, earlierPageNumber: number, newerPageNumber: number, options: DiffOptions, signal: AbortSignal, workerSrc: string, onMetric?: DiffMetricSink): Promise<ComparisonPage> {
  const sourceAttributes = { earlierBytes: sourceByteLength(earlier), newerBytes: sourceByteLength(newer), earlierPageNumber, newerPageNumber };
  return measureAsync(onMetric, "comparison.page_pair", async () => {
    const pair = await measureAsync(onMetric, "pdf.load.pair", () => loadPdfPair(earlier, newer, { signal, workerSrc, metrics: onMetric }), sourceAttributes);
    try {
      throwIfAborted(signal);
      return await compareExistingPage({
        earlier: pair.earlier,
        newer: pair.newer,
        earlierPageNumber,
        newerPageNumber,
        index: earlierPageNumber - 1,
        options,
        policy: comparisonPolicy(options),
        signal,
        metrics: onMetric,
      });
    } finally {
      await Promise.allSettled([pair.earlier.destroy(), pair.newer.destroy()]);
    }
  }, sourceAttributes);
}

export interface PdfJsEngineOptions {
  /** URL for the PDF.js worker emitted by the host bundler. */
  workerSrc: string;
}

export interface PdfJsEngine extends DiffEngine<PdfSource, AbortSignal> {
  comparePagePair(request: {
    earlier: PdfSource;
    newer: PdfSource;
    earlierPageIndex: number;
    newerPageIndex: number;
    options: DiffOptions;
    signal: AbortSignal;
    onMetric?: DiffMetricSink;
  }): Promise<ComparisonPage>;
}

export function createPdfJsEngine({ workerSrc }: PdfJsEngineOptions): PdfJsEngine {
  return {
    compare: ({ earlier, newer, options, signal, onReady, onPage, onProgress, onMetric }) => comparePdfPair(earlier, newer, options, signal, workerSrc, onReady, onPage, onProgress, onMetric),
    comparePagePair: ({ earlier, newer, earlierPageIndex, newerPageIndex, options, signal, onMetric }) => comparePdfPagePair(earlier, newer, earlierPageIndex + 1, newerPageIndex + 1, options, signal, workerSrc, onMetric),
  };
}
