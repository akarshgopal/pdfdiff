import { useCallback, useEffect, useState } from "react";
import type { DiffComparison, DiffPage, DiffViewMode, RenderQuality, SourceSide } from "./types.js";
import { adjacentChangedPageIndex, buildPreviewPage, clampPageIndex, defaultViewMode, modeNeedsComparedPair, pageStatus, qualityForZoom, sourcePageCount, viewModes } from "./viewer-utils.js";
import { useViewerKeyboard } from "./useViewerKeyboard.js";

interface PairResolution {
  comparison: DiffComparison;
  key: string;
  quality: RenderQuality;
  page?: DiffPage;
  error?: string;
}

interface ComparisonPairState {
  page: DiffPage | null;
  error: string | null;
}

function pageAt(pages: ReadonlyArray<DiffPage>, index: number): DiffPage | null {
  return pages[index] ?? null;
}

function resolutionFor(comparison: DiffComparison, key: string, resolution: PairResolution | null): PairResolution | null {
  return resolution?.comparison === comparison && resolution.key === key ? resolution : null;
}

/**
 * A page arrives from the batch pass without overlay layers, because building
 * them for every page costs time and memory to serve one visible page. The
 * on-demand resolver that already backs mismatched A/B pairs supplies them for
 * the page on screen, and its cache means a page pays that cost once.
 */
function comparisonPairState(comparison: DiffComparison, pages: ReadonlyArray<DiffPage>, earlierPageIndex: number, newerPageIndex: number, key: string, resolution: PairResolution | null): ComparisonPairState {
  const resolved = resolutionFor(comparison, key, resolution);
  if (earlierPageIndex === newerPageIndex) {
    return { page: resolved?.page ?? pageAt(pages, earlierPageIndex), error: null };
  }
  if (resolved) return { page: resolved.page ?? null, error: resolved.error ?? null };
  return {
    page: null,
    error: comparison.comparePagePair ? null : "This comparison source cannot calculate a diff for independently selected pages.",
  };
}

export function useViewerState({ comparison, onSave }: { comparison: DiffComparison; onSave?: () => void }) {
  const pages = comparison.pages;
  const [pageIndex, setPageIndex] = useState(0);
  // Until the reviewer picks a view, the comparison chooses the one that reads.
  const [chosenMode, setChosenMode] = useState<DiffViewMode | null>(null);
  const [zoom, setZoom] = useState(100);
  const [swipe, setSwipe] = useState(50);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [earlierPageIndex, setEarlierPageIndex] = useState(0);
  const [newerPageIndex, setNewerPageIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [quality, setQuality] = useState<RenderQuality>("standard");
  const [pairResolution, setPairResolution] = useState<PairResolution | null>(null);

  const mode = chosenMode ?? defaultViewMode(pages);
  const earlierPageCount = comparison.earlierPageCount ?? sourcePageCount(pages, "earlier");
  const newerPageCount = comparison.newerPageCount ?? sourcePageCount(pages, "newer");
  const currentPage = pageAt(pages, pageIndex);
  const earlierPage = pageAt(pages, earlierPageIndex);
  const newerPage = pageAt(pages, newerPageIndex);
  const sourcePagesAligned = earlierPageIndex === newerPageIndex;
  const pairKey = `${earlierPageIndex}:${newerPageIndex}`;
  const pairComparisonMode = modeNeedsComparedPair(mode);
  const pair = comparisonPairState(comparison, pages, earlierPageIndex, newerPageIndex, pairKey, pairResolution);
  const pairError = pairComparisonMode ? pair.error : null;
  const comparisonPairPage = pair.page;
  // One resolution per page pair, tagged with the quality it was rendered at.
  // Keying it this way keeps the last render on screen while a quality change
  // re-renders, and still stops a page that genuinely has no layers from asking
  // for them forever.
  const resolved = resolutionFor(comparison, pairKey, pairResolution);
  const upToDate = resolved?.quality === quality;
  const staleQuality = Boolean(resolved) && !upToDate;
  const needsPairComparison = pairComparisonMode && !sourcePagesAligned && !pair.page && !pair.error;
  const needsOverlayLayers = mode === "diff" && Boolean(pair.page) && !pair.page?.layers;
  // A high-quality page only exists once it has been re-rendered, so asking for
  // it is what makes it appear — the batch page is never good enough.
  const needsHighQuality = quality !== "standard";

  const selectPage = useCallback((index: number) => {
    const nextIndex = clampPageIndex(index, pages.length);
    setPageIndex(nextIndex);
    setEarlierPageIndex(clampPageIndex(nextIndex, earlierPageCount));
    setNewerPageIndex(clampPageIndex(nextIndex, newerPageCount));
    setSelectedRegion(null);
  }, [earlierPageCount, newerPageCount, pages.length]);

  const stepChange = useCallback((direction: 1 | -1) => {
    selectPage(adjacentChangedPageIndex(pages, pageIndex, direction));
  }, [pageIndex, pages, selectPage]);

  const goToSourcePage = useCallback((side: SourceSide, index: number) => {
    const nextIndex = side === "earlier" ? clampPageIndex(index, earlierPageCount) : clampPageIndex(index, newerPageCount);
    if (side === "earlier") setEarlierPageIndex(nextIndex);
    else setNewerPageIndex(nextIndex);
    setSelectedRegion(null);
  }, [earlierPageCount, newerPageCount]);

  const stepSourcePage = useCallback((side: SourceSide, direction: 1 | -1) => {
    const currentIndex = side === "earlier" ? earlierPageIndex : newerPageIndex;
    goToSourcePage(side, currentIndex + direction);
  }, [earlierPageIndex, goToSourcePage, newerPageIndex]);

  // Quality is a consequence of how closely the reviewer is looking, not a
  // button they should have to find, so it moves with the zoom that caused it.
  const changeZoom = useCallback((next: number) => {
    setZoom(next);
    setQuality((current) => qualityForZoom(next, current));
  }, []);

  const changeMode = useCallback((nextMode: DiffViewMode) => setChosenMode(nextMode), []);

  const cycleMode = useCallback((direction: 1 | -1) => {
    const currentIndex = viewModes.findIndex((item) => item.id === mode);
    changeMode(viewModes[(currentIndex + direction + viewModes.length) % viewModes.length]!.id);
  }, [changeMode, mode]);

  useEffect(() => {
    if (!comparison.comparePagePair || upToDate) return;
    // Either the pair itself is missing, or it is present but has no layers to tint.
    if (!needsPairComparison && !needsOverlayLayers && !needsHighQuality && !staleQuality) return;

    const abortController = new AbortController();
    void comparison.comparePagePair({ earlierPageIndex, newerPageIndex, quality, signal: abortController.signal }).then((page) => {
      if (abortController.signal.aborted) return;
      setPairResolution({ comparison, key: pairKey, quality, page });
    }).catch((error: unknown) => {
      if (abortController.signal.aborted) return;
      setPairResolution({ comparison, key: pairKey, quality, error: error instanceof Error ? error.message : "Unable to compare the selected pages." });
    });
    return () => abortController.abort();
  }, [comparison, earlierPageIndex, newerPageIndex, quality, pairKey, upToDate, staleQuality, needsPairComparison, needsOverlayLayers, needsHighQuality]);

  useViewerKeyboard({ enabled: !showHelp, pageIndex, pageCount: pages.length, earlierPageCount, newerPageCount, onSelectPage: selectPage, onStepChange: stepChange, onStepSourcePage: stepSourcePage, onGoToSourcePage: goToSourcePage, onClearSelection: () => setSelectedRegion(null), onChangeMode: changeMode, onCycleMode: cycleMode, zoom, onZoomChange: changeZoom, onSave, onShowHelp: () => setShowHelp(true) });

  // Nothing to jump between when every page matched, so the controls say so.
  const hasChanges = pages.some((page) => pageStatus(page) !== "same");
  const previewPage = buildPreviewPage({ currentPage, earlierPage, newerPage, comparisonPairPage });
  const pairComparisonPending = needsPairComparison;
  return {
    pages,
    pageIndex,
    mode,
    zoom,
    swipe,
    selectedRegion,
    earlierPageIndex,
    newerPageIndex,
    showHelp,
    earlierPageCount,
    newerPageCount,
    pairComparisonPending,
    pairError,
    currentPage,
    earlierPage,
    newerPage,
    previewPage,
    selectPage,
    stepChange,
    hasChanges,
    goToSourcePage,
    stepSourcePage,
    changeMode,
    setZoom: changeZoom,
    setSwipe,
    setSelectedRegion,
    setShowHelp,
  };
}
