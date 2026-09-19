import {
  ADDED_PAGE_THRESHOLD,
  CLASSIFY_REGION_LIMIT,
  REGION_MIN_PIXELS,
  STANDARD_RENDER_MAX_DIMENSION,
  STANDARD_RENDER_MAX_PIXELS,
  STANDARD_RENDER_SCALE,
  alignPages,
  blankImage,
  classifyPage,
  comparisonThreshold,
  geometryForPage,
  limitRegions,
  fingerprintPage,
  pageSimilarity,
  diffSemanticPages,
  measureAsync,
  regionMergeGaps,
  type ComparisonPage,
  type AlignedPagePair,
  type ComparisonReadyEvent,
  type PageAlignmentKind,
  type ComparisonResult,
  type DiffEngine,
  type DiffMetric,
  type DiffMetricSink,
  type DiffOptions,
  type PageText,
  type RenderedPage,
  type RgbColor,
} from "@pdfdiff/core";
import { extractDocumentText, extractPageText } from "@pdfdiff/pdfjs-text";
import { createRasterDiffClient, type RasterDiffClient, type RasterDiffWorkerFactory } from "./raster-diff-client.js";
import { rasterImage } from "./raster-diff-job.js";
import { loadPdfPair } from "./pdf.js";
import { renderPage, renderPagePair } from "./render.js";
import type { LoadedPdf, PdfSource } from "./types.js";

/** How many regions the viewer shows. */
const MAX_REGIONS = 80;

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
  standard: {
    scale: STANDARD_RENDER_SCALE,
    maxPixels: STANDARD_RENDER_MAX_PIXELS,
    maxDimension: STANDARD_RENDER_MAX_DIMENSION,
  },
  high: { scale: 3, maxPixels: 6_750_000, maxDimension: 4200 },
};

const DEFAULT_UNCHANGED_OPACITY = 0.4;

/** An unset overlay style leaves the core defaults in place. */
function overlayStyle(options: DiffOptions): {
  addedColor?: RgbColor;
  removedColor?: RgbColor;
  modifiedColor?: RgbColor;
  unchangedOpacity: number;
} {
  return {
    addedColor: options.overlay?.addedColor,
    removedColor: options.overlay?.removedColor,
    modifiedColor: options.overlay?.modifiedColor,
    unchangedOpacity: options.overlay?.unchangedOpacity ?? DEFAULT_UNCHANGED_OPACITY,
  };
}

function sourceByteLength(source: PdfSource): number {
  if (typeof File !== "undefined" && source instanceof File) return source.size;
  if (source instanceof ArrayBuffer) return source.byteLength;
  return (source as Uint8Array).byteLength;
}

function yieldToBrowser(signal: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function emptyPageText(pageNumber: number, page: RenderedPage): PageText {
  return { pageNumber, width: page.widthPoints, height: page.heightPoints, items: [], text: "", hasText: false };
}

function pageMetricSink(sink: DiffMetricSink | undefined, pageNumber: number): DiffMetricSink | undefined {
  if (!sink) return undefined;
  return (metric: DiffMetric) =>
    sink({
      ...metric,
      attributes: { pageNumber, ...metric.attributes },
    });
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
  readonly rasterDiff: RasterDiffClient;
}

async function pageTextFor(
  cached: PageText | undefined,
  document: LoadedPdf,
  pageNumber: number,
  signal: AbortSignal,
  metrics?: DiffMetricSink,
): Promise<PageText> {
  return cached ?? (await extractPageText(document, pageNumber, { signal, metrics }));
}

async function compareExistingPage(request: PageComparisonRequest): Promise<ComparisonPage> {
  const { earlier, newer, earlierPageNumber, newerPageNumber, options, signal, metrics } = request;
  const rendered = await renderPagePair(earlier, newer, earlierPageNumber, newerPageNumber, {
    ...RENDER_BUDGETS[request.quality ?? "standard"],
    signal,
    metrics,
  });
  await yieldToBrowser(signal);
  // Align and diff hand their rasters to the worker and get them back, so the
  // page's pixels are never copied and never touched on this thread.
  const diff = await request.rasterDiff.run(
    {
      width: rendered.earlier.width,
      height: rendered.earlier.height,
      earlier: rendered.earlier.data.buffer as ArrayBuffer,
      newer: rendered.newer.data.buffer as ArrayBuffer,
      alignByTranslation: options.alignment === "translation",
      threshold: comparisonThreshold(options.sensitivity),
      includeAA: false,
      ...overlayStyle(options),
      regionOptions: {
        minPixels: REGION_MIN_PIXELS,
        maxRegions: CLASSIFY_REGION_LIMIT,
        connectivity: 8,
        readingOrder: true,
        ...regionMergeGaps(rendered.earlier.height),
      },
      withLayers: Boolean(request.withLayers),
      withMetrics: Boolean(metrics),
    },
    signal,
    metrics,
  );
  const { width, height } = rendered.earlier;
  const earlierRaster: RenderedPage = { ...rendered.earlier, data: new Uint8ClampedArray(diff.earlier) };
  const alignedNewer: RenderedPage = { ...rendered.newer, data: new Uint8ClampedArray(diff.newer) };
  const [oldText, newText] = await Promise.all([
    pageTextFor(request.earlierText, earlier, earlierPageNumber, signal, metrics),
    pageTextFor(request.newerText, newer, newerPageNumber, signal, metrics),
  ]);
  const semantic = diffSemanticPages(oldText, newText, { signal, metrics });
  const visualGeometry = {
    earlier: geometryForPage(rendered.earlier, width, height),
    newer: geometryForPage(rendered.newer, width, height, diff.dx, diff.dy),
  };
  const classification = classifyPage({ regions: diff.regions, semantic, geometry: visualGeometry });
  return {
    index: request.index,
    earlierPageNumber,
    newerPageNumber,
    alignment: request.alignment ?? "matched",
    similarity:
      request.similarity ??
      (oldText.decodable === false || newText.decodable === false
        ? undefined
        : pageSimilarity(
            fingerprintPage(oldText.text, earlierPageNumber),
            fingerprintPage(newText.text, newerPageNumber),
          )),
    width,
    height,
    status: diff.changedPixels === 0 && semantic.changes.length === 0 ? "same" : "changed",
    earlier: earlierRaster,
    newer: alignedNewer,
    diff: rasterImage(width, height, diff.overlay),
    diffLayers: diff.layers && {
      width,
      height,
      base: rasterImage(width, height, diff.layers.base),
      added: rasterImage(width, height, diff.layers.added),
      removed: rasterImage(width, height, diff.layers.removed),
      modified: rasterImage(width, height, diff.layers.modified),
    },
    changedPixels: diff.changedPixels,
    changedPercent: diff.changedPercent,
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
  readonly rasterDiff: RasterDiffClient;
}

async function compareMissingPage(request: MissingPageRequest): Promise<ComparisonPage> {
  const { document, pageNumber, hasEarlier, signal, metrics } = request;
  const rendered = await renderPage(document, pageNumber, {
    scale: STANDARD_RENDER_SCALE,
    maxPixels: STANDARD_RENDER_MAX_PIXELS,
    maxDimension: STANDARD_RENDER_MAX_DIMENSION,
    signal,
    metrics,
  });
  await yieldToBrowser(signal);
  const blank = blankImage(rendered.width, rendered.height);
  // A wholly added or removed page is diffed against blank paper, on the same
  // worker as every other page so this thread stays free either way.
  const diff = await request.rasterDiff.run(
    {
      width: rendered.width,
      height: rendered.height,
      earlier: (hasEarlier ? rendered.data : blank.data).buffer as ArrayBuffer,
      newer: (hasEarlier ? blank.data : rendered.data).buffer as ArrayBuffer,
      alignByTranslation: false,
      threshold: ADDED_PAGE_THRESHOLD,
      includeAA: true,
      unchangedOpacity: DEFAULT_UNCHANGED_OPACITY,
      regionOptions: {
        minPixels: REGION_MIN_PIXELS,
        maxRegions: Math.min(MAX_REGIONS, 40),
        readingOrder: true,
        ...regionMergeGaps(rendered.height),
      },
      withLayers: false,
      withMetrics: Boolean(metrics),
    },
    signal,
    metrics,
  );
  const { width, height } = rendered;
  const page: RenderedPage = { ...rendered, data: new Uint8ClampedArray(hasEarlier ? diff.earlier : diff.newer) };
  const pageText = await pageTextFor(request.pageText, document, pageNumber, signal, metrics);
  const semantic = hasEarlier
    ? diffSemanticPages(pageText, emptyPageText(pageNumber, rendered), { signal, metrics })
    : diffSemanticPages(emptyPageText(pageNumber, rendered), pageText, { signal, metrics });
  return {
    index: request.index,
    earlierPageNumber: hasEarlier ? pageNumber : undefined,
    newerPageNumber: hasEarlier ? undefined : pageNumber,
    alignment: hasEarlier ? "removed" : "added",
    similarity: 0,
    width,
    height,
    status: hasEarlier ? "removed" : "added",
    earlier: hasEarlier ? page : undefined,
    newer: hasEarlier ? undefined : page,
    diff: rasterImage(width, height, diff.overlay),
    changedPixels: diff.changedPixels,
    changedPercent: diff.changedPercent,
    regions: diff.regions.map((region) => ({ ...region, changeClass: "content" as const })),
    changeClasses: { content: diff.regions.length, reflow: 0, formatting: 0, graphic: 0 },
    noticeable: true,
    semantic,
    visualGeometry: hasEarlier
      ? { earlier: geometryForPage(rendered, width, height) }
      : { newer: geometryForPage(rendered, width, height) },
  };
}

function comparePairForAlignment(
  pair: AlignedPagePair,
  index: number,
  context: {
    earlier: LoadedPdf;
    newer: LoadedPdf;
    earlierText: readonly PageText[];
    newerText: readonly PageText[];
    options: DiffOptions;
    signal: AbortSignal;
    metrics?: DiffMetricSink;
    rasterDiff: RasterDiffClient;
  },
): Promise<ComparisonPage> {
  const { earlier, newer, earlierText, newerText, options, signal, metrics, rasterDiff } = context;
  if (pair.earlierPageNumber !== undefined && pair.newerPageNumber !== undefined) {
    return compareExistingPage({
      earlier,
      newer,
      index,
      options,
      signal,
      metrics,
      rasterDiff,
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
    pageNumber,
    index,
    hasEarlier,
    signal,
    metrics,
    rasterDiff,
    pageText: (hasEarlier ? earlierText : newerText)[pageNumber - 1],
  });
}

async function comparePdfPair(
  earlier: PdfSource,
  newer: PdfSource,
  options: DiffOptions,
  signal: AbortSignal,
  loadPair: (
    earlier: PdfSource,
    newer: PdfSource,
    signal: AbortSignal,
    metrics?: DiffMetricSink,
  ) => Promise<LoadedPair>,
  onReady?: (event: ComparisonReadyEvent) => void | Promise<void>,
  onPage?: (page: ComparisonPage) => void | Promise<void>,
  onProgress?: (progress: { completed: number; total: number }) => void,
  onMetric?: DiffMetricSink,
  releaseOnFailure: () => Promise<void> = async () => undefined,
  rasterDiff: RasterDiffClient = createRasterDiffClient(),
): Promise<ComparisonResult> {
  const sourceAttributes = { earlierBytes: sourceByteLength(earlier), newerBytes: sourceByteLength(newer) };
  return measureAsync(
    onMetric,
    "comparison.total",
    async () => {
      const startedAt = performance.now();
      // The documents stay in the shared cache so the first page a reviewer opens
      // in overlay mode does not have to parse both files a second time.
      const pair = await measureAsync(
        onMetric,
        "pdf.load.pair",
        () => loadPair(earlier, newer, signal, onMetric),
        sourceAttributes,
      );
      const pages: ComparisonPage[] = [];

      try {
        const [earlierText, newerText] = await measureAsync(onMetric, "comparison.text", () =>
          Promise.all([
            extractDocumentText(pair.earlier, { signal, metrics: onMetric }),
            extractDocumentText(pair.newer, { signal, metrics: onMetric }),
          ]),
        );
        const alignment = alignPages(
          earlierText.map((page) => fingerprintPage(page.text, page.pageNumber)),
          newerText.map((page) => fingerprintPage(page.text, page.pageNumber)),
          { signal, metrics: onMetric, sequential: options.matchPages === false },
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
        const startPage = (index: number): Promise<ComparisonPage> => {
          const aligned = alignment[index]!;
          const metrics = pageMetricSink(onMetric, aligned.newerPageNumber ?? aligned.earlierPageNumber ?? index + 1);
          return measureAsync(
            onMetric,
            "comparison.page",
            () =>
              comparePairForAlignment(aligned, index, {
                earlier: pair.earlier,
                newer: pair.newer,
                earlierText,
                newerText,
                options,
                signal,
                metrics,
                rasterDiff,
              }),
            {
              pageIndex: index,
              earlierPageNumber: aligned.earlierPageNumber ?? 0,
              newerPageNumber: aligned.newerPageNumber ?? 0,
              kind: aligned.kind,
            },
          );
        };
        /**
         * One page of lookahead. Rendering happens here and diffing happens on
         * the worker, so starting the next page's render while this one's pixels
         * are out at the worker overlaps the two halves of the pipeline. One page
         * ahead is the whole win — the render is serial on this thread either
         * way — and it holds peak memory at two pages of rasters rather than the
         * whole document.
         */
        let inFlight: Promise<ComparisonPage> | null = totalPages > 0 ? startPage(0) : null;
        for (let index = 0; index < totalPages; index += 1) {
          signal?.throwIfAborted();
          const current = inFlight!;
          inFlight = index + 1 < totalPages ? startPage(index + 1) : null;
          // A failure here leaves the lookahead unobserved, which would surface
          // as an unhandled rejection instead of the error the caller gets.
          inFlight?.catch(() => undefined);
          const page = await current;
          await onPage?.(page);
          pages.push(keepRasters ? page : { ...page, earlier: undefined, newer: undefined, diff: undefined });
          onProgress?.({ completed: index + 1, total: totalPages });
        }

        return {
          earlierName: "name" in earlier ? earlier.name : undefined,
          newerName: "name" in newer ? newer.name : undefined,
          pages,
          alignment,
          elapsedMs: Math.round(performance.now() - startedAt),
        };
      } catch (error) {
        await releaseOnFailure();
        throw error;
      }
    },
    sourceAttributes,
  );
}

type LoadedPair = { earlier: LoadedPdf; newer: LoadedPdf };

async function comparePdfPagePair(
  earlier: PdfSource,
  newer: PdfSource,
  earlierPageNumber: number,
  newerPageNumber: number,
  options: DiffOptions,
  quality: RenderQuality,
  withLayers: boolean,
  signal: AbortSignal,
  loadPair: (
    earlier: PdfSource,
    newer: PdfSource,
    signal: AbortSignal,
    metrics?: DiffMetricSink,
  ) => Promise<LoadedPair>,
  rasterDiff: RasterDiffClient,
  onMetric?: DiffMetricSink,
): Promise<ComparisonPage> {
  const sourceAttributes = {
    earlierBytes: sourceByteLength(earlier),
    newerBytes: sourceByteLength(newer),
    earlierPageNumber,
    newerPageNumber,
    quality,
  };
  return measureAsync(
    onMetric,
    "comparison.page_pair",
    async () => {
      const pair = await measureAsync(
        onMetric,
        "pdf.load.pair",
        () => loadPair(earlier, newer, signal, onMetric),
        sourceAttributes,
      );
      signal?.throwIfAborted();
      return compareExistingPage({
        earlier: pair.earlier,
        newer: pair.newer,
        earlierPageNumber,
        newerPageNumber,
        index: earlierPageNumber - 1,
        options,
        signal,
        withLayers,
        quality,
        metrics: onMetric,
        rasterDiff,
      });
    },
    sourceAttributes,
  );
}

export interface PdfJsEngineOptions {
  /** URL for the PDF.js worker emitted by the host bundler. */
  workerSrc: string;
  /** Base URL the host serves PDF.js's font, cMap, WASM, and ICC assets from. */
  assetBaseUrl?: string;
  /**
   * Builds the raster diff worker. Without it the pixel work runs in-process,
   * which is correct but blocks the thread that is also rendering pages.
   */
  createRasterDiffWorker?: RasterDiffWorkerFactory;
}

export interface PdfJsEngine extends DiffEngine<PdfSource, AbortSignal> {
  comparePagePair(request: {
    earlier: PdfSource;
    newer: PdfSource;
    earlierPageIndex: number;
    newerPageIndex: number;
    options: DiffOptions;
    quality?: RenderQuality;
    withLayers?: boolean;
    signal: AbortSignal;
    onMetric?: DiffMetricSink;
  }): Promise<ComparisonPage>;
}

export function createPdfJsEngine({
  workerSrc,
  assetBaseUrl,
  createRasterDiffWorker,
}: PdfJsEngineOptions): PdfJsEngine {
  /**
   * Picking mismatched A and B pages in the viewer re-parsed both documents
   * every time, which for large files dominates the interaction. The most
   * recent pair is kept loaded instead. It is only ever released when a new
   * comparison starts, so a page-pair request can never race a destroy.
   */
  let loaded: { earlier: PdfSource; newer: PdfSource; pair: Promise<LoadedPair> } | null = null;
  const stale: Array<Promise<LoadedPair>> = [];
  const rasterDiff = createRasterDiffClient(createRasterDiffWorker);

  const releaseLoadedPairs = async (): Promise<void> => {
    const pending = [...stale, ...(loaded ? [loaded.pair] : [])];
    loaded = null;
    stale.length = 0;
    await Promise.allSettled(
      pending.map(async (entry) => {
        const pair = await entry.catch(() => null);
        if (pair) await Promise.allSettled([pair.earlier.destroy(), pair.newer.destroy()]);
      }),
    );
  };

  const loadPair = (
    earlier: PdfSource,
    newer: PdfSource,
    signal: AbortSignal,
    metrics?: DiffMetricSink,
  ): Promise<LoadedPair> => {
    if (loaded && loaded.earlier === earlier && loaded.newer === newer) return loaded.pair;
    if (loaded) stale.push(loaded.pair);
    const pair = loadPdfPair(earlier, newer, { signal, workerSrc, assetBaseUrl, metrics });
    loaded = { earlier, newer, pair };
    return pair;
  };

  return {
    compare: async ({ earlier, newer, options, signal, onReady, onPage, onProgress, onMetric }) => {
      await releaseLoadedPairs();
      return comparePdfPair(
        earlier,
        newer,
        options,
        signal,
        loadPair,
        onReady,
        onPage,
        onProgress,
        onMetric,
        releaseLoadedPairs,
        rasterDiff,
      );
    },
    comparePagePair: ({
      earlier,
      newer,
      earlierPageIndex,
      newerPageIndex,
      options,
      quality,
      withLayers,
      signal,
      onMetric,
    }) =>
      comparePdfPagePair(
        earlier,
        newer,
        earlierPageIndex + 1,
        newerPageIndex + 1,
        options,
        quality ?? "standard",
        withLayers ?? true,
        signal,
        loadPair,
        rasterDiff,
        onMetric,
      ),
  };
}
