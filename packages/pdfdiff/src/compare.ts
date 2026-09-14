import {
  ADDED_PAGE_THRESHOLD,
  CLASSIFY_REGION_LIMIT,
  DEFAULT_OVERLAY,
  DEFAULT_SENSITIVITY,
  REGION_MIN_PIXELS,
  alignByTranslation,
  alignPages,
  blankImage,
  buildReport,
  classifyPage,
  comparisonThreshold,
  diffImages,
  diffSemanticPages,
  fingerprintPage,
  geometryForPage,
  regionMergeGaps,
  zeroClassCounts,
  type AlignedPagePair,
  type ComparisonPage,
  type ComparisonReport,
  type PageStatus,
  type PageText,
  type RasterImage,
  type SemanticPageDiff,
} from "@pdfdiff/core";
import { extractPageText } from "@pdfdiff/pdfjs-text";
import { loadPdf, type LoadedPdf } from "./pdf.js";
import { renderPage, renderPagePair } from "./render.js";

export interface OverlayEvent {
  readonly index: number;
  readonly earlierPage?: number;
  readonly newerPage?: number;
  readonly status: PageStatus;
  readonly overlay: RasterImage;
}

export interface HeadlessCompareOptions {
  readonly matchThreshold?: number;
  readonly detectMoves?: boolean;
  /** Rasterise and pixel-diff pages. Defaults to true. */
  readonly visual?: boolean;
  /** Pixel-diff sensitivity, same scale as the web app (default 28). */
  readonly sensitivity?: number;
  /** Shift pages to cancel a small translation before the pixel diff. Defaults to true. */
  readonly alignByTranslation?: boolean;
  readonly onProgress?: (event: { completed: number; total: number }) => void;
  readonly onOverlay?: (event: OverlayEvent) => void | Promise<void>;
}

export interface HeadlessComparison {
  readonly report: ComparisonReport;
  readonly alignment: readonly AlignedPagePair[];
}

const EMPTY_PAGE: PageText = { pageNumber: 0, width: 0, height: 0, items: [], text: "", hasText: false };

function pageTextOrEmpty(pages: readonly PageText[], pageNumber: number | undefined): PageText {
  return pageNumber ? (pages[pageNumber - 1] ?? EMPTY_PAGE) : EMPTY_PAGE;
}

async function documentPages(document: LoadedPdf): Promise<PageText[]> {
  const pages: PageText[] = [];
  for (let pageNumber = 1; pageNumber <= document.pageCount; pageNumber += 1) {
    pages.push(await extractPageText(document, pageNumber));
  }
  return pages;
}

function textStatus(pair: AlignedPagePair, changeCount: number): PageStatus {
  if (pair.kind === "added") return "added";
  if (pair.kind === "removed") return "removed";
  return changeCount > 0 ? "changed" : "same";
}

function compareTextPair(pair: AlignedPagePair, index: number, semantic: SemanticPageDiff): ComparisonPage {
  const changeCount = semantic.changes.length;
  return {
    index,
    earlierPageNumber: pair.earlierPageNumber,
    newerPageNumber: pair.newerPageNumber,
    alignment: pair.kind,
    similarity: pair.similarity,
    status: textStatus(pair, changeCount),
    noticeable: changeCount > 0 || pair.kind !== "matched",
    changeClasses: { ...zeroClassCounts(), content: changeCount },
    semantic,
  };
}

async function maybeOverlay(
  page: ComparisonPage,
  overlay: RasterImage,
  onOverlay?: HeadlessCompareOptions["onOverlay"],
) {
  if (!onOverlay) return;
  if (page.status === "same" && page.alignment !== "moved") return;
  await onOverlay({
    index: page.index,
    earlierPage: page.earlierPageNumber,
    newerPage: page.newerPageNumber,
    status: page.status ?? "changed",
    overlay,
  });
}

async function compareVisualPair(
  pair: AlignedPagePair,
  index: number,
  earlier: LoadedPdf,
  newer: LoadedPdf,
  semantic: SemanticPageDiff,
  options: HeadlessCompareOptions,
): Promise<ComparisonPage> {
  const sensitivity = options.sensitivity ?? DEFAULT_SENSITIVITY;

  if (pair.earlierPageNumber !== undefined && pair.newerPageNumber !== undefined) {
    const rendered = await renderPagePair(earlier, newer, pair.earlierPageNumber, pair.newerPageNumber);
    const translation =
      options.alignByTranslation === false
        ? { image: rendered.newer, dx: 0, dy: 0 }
        : alignByTranslation(rendered.earlier, rendered.newer);
    const diff = diffImages(rendered.earlier, translation.image, {
      threshold: comparisonThreshold(sensitivity),
      includeAA: false,
      addedColor: DEFAULT_OVERLAY.addedColor,
      removedColor: DEFAULT_OVERLAY.removedColor,
      modifiedColor: DEFAULT_OVERLAY.modifiedColor,
      unchangedOpacity: DEFAULT_OVERLAY.unchangedOpacity,
      regionOptions: {
        minPixels: REGION_MIN_PIXELS,
        maxRegions: CLASSIFY_REGION_LIMIT,
        connectivity: 8,
        readingOrder: true,
        ...regionMergeGaps(rendered.earlier.height),
      },
    });
    const { width, height } = rendered.earlier;
    const classification = classifyPage({
      regions: diff.regions,
      semantic,
      geometry: {
        earlier: geometryForPage(rendered.earlier, width, height),
        newer: geometryForPage(rendered.newer, width, height, translation.dx, translation.dy),
      },
    });
    const status: PageStatus = diff.changedPixels === 0 && semantic.changes.length === 0 ? "same" : "changed";
    const page: ComparisonPage = {
      index,
      earlierPageNumber: pair.earlierPageNumber,
      newerPageNumber: pair.newerPageNumber,
      alignment: pair.kind,
      similarity: pair.similarity,
      width,
      height,
      status,
      changedPixels: diff.changedPixels,
      changedPercent: diff.changedPercent,
      changeClasses: classification.counts,
      noticeable: classification.noticeable,
      semantic,
    };
    await maybeOverlay(page, diff.overlay, options.onOverlay);
    return page;
  }

  const hasEarlier = pair.earlierPageNumber !== undefined;
  const pageNumber = (hasEarlier ? pair.earlierPageNumber : pair.newerPageNumber)!;
  const document = hasEarlier ? earlier : newer;
  const rendered = await renderPage(document, pageNumber);
  const blank = blankImage(rendered.width, rendered.height);
  const earlierRaster: RasterImage = hasEarlier ? rendered : blank;
  const newerRaster: RasterImage = hasEarlier ? blank : rendered;
  const diff = diffImages(earlierRaster, newerRaster, {
    threshold: ADDED_PAGE_THRESHOLD,
    includeAA: true,
    unchangedOpacity: DEFAULT_OVERLAY.unchangedOpacity,
    regionOptions: {
      minPixels: REGION_MIN_PIXELS,
      maxRegions: 40,
      readingOrder: true,
      ...regionMergeGaps(rendered.height),
    },
  });
  const page: ComparisonPage = {
    index,
    earlierPageNumber: pair.earlierPageNumber,
    newerPageNumber: pair.newerPageNumber,
    alignment: pair.kind,
    similarity: 0,
    width: rendered.width,
    height: rendered.height,
    status: hasEarlier ? "removed" : "added",
    changedPixels: diff.changedPixels,
    changedPercent: diff.changedPercent,
    changeClasses: { content: diff.regions.length, reflow: 0, formatting: 0, graphic: 0 },
    noticeable: true,
    semantic,
  };
  await maybeOverlay(page, diff.overlay, options.onOverlay);
  return page;
}

/**
 * Compare two PDFs. Visual (raster) diff is on by default; pass `{ visual: false }`
 * for the text-only path used by `--text-only`.
 */
export async function comparePdfs(
  earlierPath: string,
  newerPath: string,
  options: HeadlessCompareOptions = {},
): Promise<HeadlessComparison> {
  const visual = options.visual !== false;
  const [earlier, newer] = await Promise.all([loadPdf(earlierPath), loadPdf(newerPath)]);
  try {
    const [earlierText, newerText] = await Promise.all([documentPages(earlier), documentPages(newer)]);
    const alignment = alignPages(
      earlierText.map((page) => fingerprintPage(page.text, page.pageNumber)),
      newerText.map((page) => fingerprintPage(page.text, page.pageNumber)),
      { matchThreshold: options.matchThreshold, detectMoves: options.detectMoves },
    );
    const pages: ComparisonPage[] = [];
    for (let index = 0; index < alignment.length; index += 1) {
      const pair = alignment[index]!;
      const semantic = diffSemanticPages(
        pageTextOrEmpty(earlierText, pair.earlierPageNumber),
        pageTextOrEmpty(newerText, pair.newerPageNumber),
      );
      pages.push(
        visual
          ? await compareVisualPair(pair, index, earlier, newer, semantic, options)
          : compareTextPair(pair, index, semantic),
      );
      options.onProgress?.({ completed: index + 1, total: alignment.length });
    }
    return {
      alignment,
      report: buildReport({ earlierName: earlier.name, newerName: newer.name, pages, alignment }),
    };
  } finally {
    await Promise.allSettled([earlier.destroy(), newer.destroy()]);
  }
}

/**
 * A text-only comparison: page alignment plus the semantic diff. Everything a
 * pipeline needs to answer "did the wording change", with no rasteriser.
 */
export function comparePdfText(
  earlierPath: string,
  newerPath: string,
  options: HeadlessCompareOptions = {},
): Promise<HeadlessComparison> {
  return comparePdfs(earlierPath, newerPath, { ...options, visual: false });
}
