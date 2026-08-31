import {
  alignByTranslation,
  alignPages,
  classifyRegions,
  limitRegions,
  fingerprintPage,
  diffImages,
  overlayLayers,
  diffSemanticPages,
  measure,
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
  type PageText,
  type RasterImage,
  type RgbColor,
  type SemanticPageDiff,
  type TextQuad,
  type VisualPageGeometry,
} from "@pdfdiff/core";
import { extractDocumentText, extractPageText } from "./text.js";
import { loadPdfPair } from "./pdf.js";
import { renderPage, renderPagePair } from "./render.js";
import type { LoadedPdf, PdfSource, RenderedPage } from "./types.js";

const PREVIEW_SCALE = 2;
const MAX_PIXELS = 3_000_000;
const MAX_DIMENSION = 2800;
const REGION_MIN_PIXELS = 8;
/** How many regions the viewer shows. */
const MAX_REGIONS = 80;
/**
 * Classification runs over far more regions than are displayed, so a page's
 * class counts and its "is anything noticeable" verdict describe the whole
 * page rather than whichever regions happened to be largest.
 */
const CLASSIFY_REGION_LIMIT = 1200;
const ADDED_PAGE_THRESHOLD = 0.08;

export type RenderQuality = "standard" | "high";

interface RenderBudget {
  readonly scale: number;
  readonly maxPixels: number;
  readonly maxDimension: number;
}

/**
 * The batch pass renders every page, so its budget is sized for a whole
 * document. A reviewer inspecting one page can afford more.
 * ponytail: 2.25x the standard pixel budget; one page at a time keeps peak
 * memory bounded, raise it if reviewers ask to zoom further.
 */
const RENDER_BUDGETS: Record<RenderQuality, RenderBudget> = {
  standard: { scale: PREVIEW_SCALE, maxPixels: MAX_PIXELS, maxDimension: MAX_DIMENSION },
  high: { scale: 3, maxPixels: 6_750_000, maxDimension: 4200 },
};

/**
 * Changed pixels arrive one glyph at a time; these gaps rejoin a word or line
 * without pulling in the line below, and scale with the rendered page so the
 * behaviour holds for both letter pages and large-format drawings.
 */
function regionMergeGaps(pageHeight: number): { mergeGapX: number; mergeGapY: number } {
  return {
    mergeGapX: Math.max(6, Math.round(pageHeight * 0.009)),
    mergeGapY: Math.max(2, Math.round(pageHeight * 0.0025)),
  };
}

const DEFAULT_UNCHANGED_OPACITY = 0.24;

/** An unset overlay style leaves the core defaults in place. */
function overlayStyle(options: DiffOptions): { addedColor?: RgbColor; removedColor?: RgbColor; unchangedOpacity: number } {
  return {
    addedColor: options.overlay?.addedColor,
    removedColor: options.overlay?.removedColor,
    unchangedOpacity: options.overlay?.unchangedOpacity ?? DEFAULT_UNCHANGED_OPACITY,
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

function blankImage(width: number, height: number): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  return { width, height, data };
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
  readonly signal: AbortSignal;
  /**
   * Recolourable layers cost an extra pass and three more encodes per page, so
   * only the page a reviewer is actually looking at asks for them.
   */
  readonly withLayers?: boolean;
  /** Render resolution for this page; the batch pass leaves it at standard. */
  readonly quality?: RenderQuality;
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
  const { earlier, newer, earlierPageNumber, newerPageNumber, options, signal, metrics } = request;
  const rendered = await renderPagePair(earlier, newer, earlierPageNumber, newerPageNumber, { ...RENDER_BUDGETS[request.quality ?? "standard"], signal, metrics });
  await yieldToBrowser(signal);
  const translation = options.alignment === "translation" ? alignByTranslation(rendered.earlier, rendered.newer, signal, metrics) : { image: rendered.newer, dx: 0, dy: 0 };
  const alignedNewer: RenderedPage = translation.image === rendered.newer ? rendered.newer : { ...rendered.newer, data: translation.image.data };
  await yieldToBrowser(signal);
  const result = diffImages(rendered.earlier, alignedNewer, { threshold: comparisonThreshold(options.sensitivity), includeAA: false, ...overlayStyle(options), regionOptions: { minPixels: REGION_MIN_PIXELS, maxRegions: CLASSIFY_REGION_LIMIT, connectivity: 8, readingOrder: true, ...regionMergeGaps(rendered.earlier.height) }, signal, metrics });
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
    diffLayers: request.withLayers ? measure(metrics, "core.visual.layers", () => overlayLayers(rendered.earlier, alignedNewer, result.directionMask, signal), { width: result.width, height: result.height }) : undefined,
    changedPixels: result.changedPixels,
    changedPercent: result.changedPercent,
    regions: limitRegions(classification.regions, MAX_REGIONS),
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
  readonly signal: AbortSignal;
  readonly pageText?: PageText;
  readonly metrics?: DiffMetricSink;
}

async function compareMissingPage(request: MissingPageRequest): Promise<ComparisonPage> {
  const { document, pageNumber, hasEarlier, signal, metrics } = request;
  const rendered = await renderPage(document, pageNumber, { scale: PREVIEW_SCALE, maxPixels: MAX_PIXELS, maxDimension: MAX_DIMENSION, signal, metrics });
  await yieldToBrowser(signal);
  const blank = blankImage(rendered.width, rendered.height);
  const oldImage: RasterImage = hasEarlier ? rendered : blank;
  const newImage: RasterImage = hasEarlier ? blank : rendered;
  const result = diffImages(oldImage, newImage, { threshold: ADDED_PAGE_THRESHOLD, includeAA: true, regionOptions: { minPixels: REGION_MIN_PIXELS, maxRegions: Math.min(MAX_REGIONS, 40), readingOrder: true, ...regionMergeGaps(rendered.height) }, signal, metrics });
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

function comparePairForAlignment(pair: AlignedPagePair, index: number, context: {
  earlier: LoadedPdf;
  newer: LoadedPdf;
  earlierText: readonly PageText[];
  newerText: readonly PageText[];
  options: DiffOptions;
  signal: AbortSignal;
  metrics?: DiffMetricSink;
}): Promise<ComparisonPage> {
  const { earlier, newer, earlierText, newerText, options, signal, metrics } = context;
  if (pair.earlierPageNumber !== undefined && pair.newerPageNumber !== undefined) {
    return compareExistingPage({
      earlier, newer, index, options, signal, metrics,
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
    pageNumber, index, hasEarlier, signal, metrics,
    pageText: (hasEarlier ? earlierText : newerText)[pageNumber - 1],
  });
}

async function comparePdfPair(
  earlier: PdfSource,
  newer: PdfSource,
  options: DiffOptions,
  signal: AbortSignal,
  loadPair: (earlier: PdfSource, newer: PdfSource, signal: AbortSignal, metrics?: DiffMetricSink) => Promise<LoadedPair>,
  onReady?: (event: ComparisonReadyEvent) => void | Promise<void>,
  onPage?: (page: ComparisonPage) => void | Promise<void>,
  onProgress?: (progress: { completed: number; total: number }) => void,
  onMetric?: DiffMetricSink,
  releaseOnFailure: () => Promise<void> = async () => undefined,
): Promise<ComparisonResult> {
  const sourceAttributes = { earlierBytes: sourceByteLength(earlier), newerBytes: sourceByteLength(newer) };
  return measureAsync(onMetric, "comparison.total", async () => {
    const startedAt = performance.now();
    // The documents stay in the shared cache so the first page a reviewer opens
    // in overlay mode does not have to parse both files a second time.
    const pair = await measureAsync(onMetric, "pdf.load.pair", () => loadPair(earlier, newer, signal, onMetric), sourceAttributes);
    const pages: ComparisonPage[] = [];

    try {
      const [earlierText, newerText] = await measureAsync(onMetric, "comparison.text", () => Promise.all([
        extractDocumentText(pair.earlier, { signal, metrics: onMetric }),
        extractDocumentText(pair.newer, { signal, metrics: onMetric }),
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
      // A page's rasters are three full-size buffers. Once a streaming caller
      // has taken them the engine must not keep them, or peak memory grows with
      // the page count instead of staying flat. Without onPage there is no other
      // consumer, so the result keeps them.
      const keepRasters = !onPage;
      for (const [index, aligned] of alignment.entries()) {
        throwIfAborted(signal);
        const metrics = pageMetricSink(onMetric, aligned.newerPageNumber ?? aligned.earlierPageNumber ?? index + 1);
        const page = await measureAsync(onMetric, "comparison.page", () => comparePairForAlignment(aligned, index, {
          earlier: pair.earlier, newer: pair.newer, earlierText, newerText, options, signal, metrics,
        }), {
          pageIndex: index,
          earlierPageNumber: aligned.earlierPageNumber ?? 0,
          newerPageNumber: aligned.newerPageNumber ?? 0,
          kind: aligned.kind,
        });
        await onPage?.(page);
        pages.push(keepRasters ? page : { ...page, earlier: undefined, newer: undefined, diff: undefined });
        onProgress?.({ completed: index + 1, total: totalPages });
      }

      return { earlierName: "name" in earlier ? earlier.name : undefined, newerName: "name" in newer ? newer.name : undefined, pages, alignment, elapsedMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      await releaseOnFailure();
      throw error;
    }
  }, sourceAttributes);
}

type LoadedPair = { earlier: LoadedPdf; newer: LoadedPdf };

async function comparePdfPagePair(earlier: PdfSource, newer: PdfSource, earlierPageNumber: number, newerPageNumber: number, options: DiffOptions, quality: RenderQuality, signal: AbortSignal, loadPair: (earlier: PdfSource, newer: PdfSource, signal: AbortSignal, metrics?: DiffMetricSink) => Promise<LoadedPair>, onMetric?: DiffMetricSink): Promise<ComparisonPage> {
  const sourceAttributes = { earlierBytes: sourceByteLength(earlier), newerBytes: sourceByteLength(newer), earlierPageNumber, newerPageNumber, quality };
  return measureAsync(onMetric, "comparison.page_pair", async () => {
    const pair = await measureAsync(onMetric, "pdf.load.pair", () => loadPair(earlier, newer, signal, onMetric), sourceAttributes);
    throwIfAborted(signal);
    return compareExistingPage({
      earlier: pair.earlier,
      newer: pair.newer,
      earlierPageNumber,
      newerPageNumber,
      index: earlierPageNumber - 1,
      options,
      signal,
      withLayers: true,
      quality,
      metrics: onMetric,
    });
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
    quality?: RenderQuality;
    signal: AbortSignal;
    onMetric?: DiffMetricSink;
  }): Promise<ComparisonPage>;
}

export function createPdfJsEngine({ workerSrc }: PdfJsEngineOptions): PdfJsEngine {
  /**
   * Picking mismatched A and B pages in the viewer re-parsed both documents
   * every time, which for large files dominates the interaction. The most
   * recent pair is kept loaded instead. It is only ever released when a new
   * comparison starts, so a page-pair request can never race a destroy.
   */
  let loaded: { earlier: PdfSource; newer: PdfSource; pair: Promise<LoadedPair> } | null = null;
  const stale: Array<Promise<LoadedPair>> = [];

  const releaseLoadedPairs = async (): Promise<void> => {
    const pending = [...stale, ...(loaded ? [loaded.pair] : [])];
    loaded = null;
    stale.length = 0;
    await Promise.allSettled(pending.map(async (entry) => {
      const pair = await entry.catch(() => null);
      if (pair) await Promise.allSettled([pair.earlier.destroy(), pair.newer.destroy()]);
    }));
  };

  const loadPair = (earlier: PdfSource, newer: PdfSource, signal: AbortSignal, metrics?: DiffMetricSink): Promise<LoadedPair> => {
    if (loaded && loaded.earlier === earlier && loaded.newer === newer) return loaded.pair;
    if (loaded) stale.push(loaded.pair);
    const pair = loadPdfPair(earlier, newer, { signal, workerSrc, metrics });
    loaded = { earlier, newer, pair };
    return pair;
  };

  return {
    compare: async ({ earlier, newer, options, signal, onReady, onPage, onProgress, onMetric }) => {
      await releaseLoadedPairs();
      return comparePdfPair(earlier, newer, options, signal, loadPair, onReady, onPage, onProgress, onMetric, releaseLoadedPairs);
    },
    comparePagePair: ({ earlier, newer, earlierPageIndex, newerPageIndex, options, quality, signal, onMetric }) => comparePdfPagePair(earlier, newer, earlierPageIndex + 1, newerPageIndex + 1, options, quality ?? "standard", signal, loadPair, onMetric),
  };
}
