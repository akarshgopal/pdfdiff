import { useCallback, useEffect, useState } from "react";
import type { DiffComparison, DiffPage, DiffViewMode, SourceSide, ViewerOptions } from "./types.js";
import { buildPreviewPage, clampPageIndex, modeNeedsComparedPair, sourcePageCount, viewModes } from "./viewer-utils.js";
import { useViewerKeyboard } from "./useViewerKeyboard.js";

interface PairResolution {
  comparison: DiffComparison;
  key: string;
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

function comparisonPairState(comparison: DiffComparison, pages: ReadonlyArray<DiffPage>, earlierPageIndex: number, newerPageIndex: number, resolution: PairResolution | null): ComparisonPairState {
  if (earlierPageIndex === newerPageIndex) return { page: pageAt(pages, earlierPageIndex), error: null };
  const key = `${earlierPageIndex}:${newerPageIndex}`;
  if (resolution?.comparison === comparison && resolution.key === key) {
    return { page: resolution.page ?? null, error: resolution.error ?? null };
  }
  return {
    page: null,
    error: comparison.comparePagePair ? null : "This comparison source cannot calculate a diff for independently selected pages.",
  };
}

function fullPageState(side: SourceSide | null, earlier: { page: DiffPage | null; index: number; count: number }, newer: { page: DiffPage | null; index: number; count: number }) {
  return side === "earlier" ? earlier : newer;
}

function startingOptions(options?: ViewerOptions): Required<ViewerOptions> {
  return { sensitivity: options?.sensitivity ?? 28, alignment: options?.alignment ?? "none" };
}

export function useViewerState({ comparison, initialOptions, onAnalytics }: { comparison: DiffComparison; initialOptions?: ViewerOptions; onAnalytics?: (event: { name: "view_mode_used"; mode: DiffViewMode }) => void }) {
  const pages = comparison.pages;
  const initial = startingOptions(initialOptions);
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<DiffViewMode>("diff");
  const [zoom, setZoom] = useState(100);
  const [swipe, setSwipe] = useState(50);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [showSemanticHighlights, setShowSemanticHighlights] = useState(true);
  const [blinkOn, setBlinkOn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sensitivity, setSensitivity] = useState(initial.sensitivity);
  const [alignment, setAlignment] = useState<"none" | "translation">(initial.alignment);
  const [fullPageSide, setFullPageSide] = useState<SourceSide | null>(null);
  const [earlierPageIndex, setEarlierPageIndex] = useState(0);
  const [newerPageIndex, setNewerPageIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [pairResolution, setPairResolution] = useState<PairResolution | null>(null);

  const earlierPageCount = sourcePageCount(pages, "earlier");
  const newerPageCount = sourcePageCount(pages, "newer");
  const currentPage = pageAt(pages, pageIndex);
  const earlierPage = pageAt(pages, earlierPageIndex);
  const newerPage = pageAt(pages, newerPageIndex);
  const sourcePagesAligned = earlierPageIndex === newerPageIndex;
  const pairKey = `${earlierPageIndex}:${newerPageIndex}`;
  const pairComparisonMode = modeNeedsComparedPair(mode);
  const pair = comparisonPairState(comparison, pages, earlierPageIndex, newerPageIndex, pairResolution);
  const pairError = pairComparisonMode ? pair.error : null;
  const comparisonPairPage = pair.page;

  const selectPage = useCallback((index: number) => {
    const nextIndex = clampPageIndex(index, pages.length);
    setPageIndex(nextIndex);
    setEarlierPageIndex(clampPageIndex(nextIndex, earlierPageCount));
    setNewerPageIndex(clampPageIndex(nextIndex, newerPageCount));
    setSelectedRegion(null);
  }, [earlierPageCount, newerPageCount, pages.length]);

  const goToSourcePage = useCallback((side: SourceSide, index: number) => {
    const nextIndex = side === "earlier" ? clampPageIndex(index, earlierPageCount) : clampPageIndex(index, newerPageCount);
    if (side === "earlier") setEarlierPageIndex(nextIndex);
    else setNewerPageIndex(nextIndex);
    setSelectedRegion(null);
    if (fullPageSide) setFullPageSide(side);
  }, [earlierPageCount, fullPageSide, newerPageCount]);

  const stepSourcePage = useCallback((side: SourceSide, direction: 1 | -1) => {
    const currentIndex = side === "earlier" ? earlierPageIndex : newerPageIndex;
    goToSourcePage(side, currentIndex + direction);
  }, [earlierPageIndex, goToSourcePage, newerPageIndex]);

  const changeMode = useCallback((nextMode: DiffViewMode) => {
    setMode(nextMode);
    onAnalytics?.({ name: "view_mode_used", mode: nextMode });
  }, [onAnalytics]);

  const cycleMode = useCallback((direction: 1 | -1) => {
    const currentIndex = viewModes.findIndex((item) => item.id === mode);
    changeMode(viewModes[(currentIndex + direction + viewModes.length) % viewModes.length]!.id);
  }, [changeMode, mode]);

  useEffect(() => {
    if (mode !== "blink") return;
    const timer = window.setInterval(() => setBlinkOn((value) => !value), 720);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (!pairComparisonMode || sourcePagesAligned || pair.page || pair.error || !comparison.comparePagePair) return;

    const abortController = new AbortController();
    void comparison.comparePagePair({ earlierPageIndex, newerPageIndex, signal: abortController.signal }).then((page) => {
      if (abortController.signal.aborted) return;
      setPairResolution({ comparison, key: pairKey, page });
    }).catch((error: unknown) => {
      if (abortController.signal.aborted) return;
      setPairResolution({ comparison, key: pairKey, error: error instanceof Error ? error.message : "Unable to compare the selected pages." });
    });
    return () => abortController.abort();
  }, [comparison, earlierPageIndex, newerPageIndex, pairComparisonMode, pairKey, pair.error, pair.page, sourcePagesAligned]);

  useViewerKeyboard({ enabled: !showHelp, pageIndex, pageCount: pages.length, earlierPageCount, newerPageCount, fullPageSide, onSelectPage: selectPage, onStepSourcePage: stepSourcePage, onGoToSourcePage: goToSourcePage, onCloseFullPage: () => setFullPageSide(null), onClearSelection: () => setSelectedRegion(null), onChangeMode: changeMode, onCycleMode: cycleMode });

  const previewPage = buildPreviewPage({ mode, currentPage, earlierPage, newerPage, comparisonPairPage });
  const pairComparisonPending = pairComparisonMode && !sourcePagesAligned && !pair.page && !pairError;
  const fullPage = fullPageState(
    fullPageSide,
    { page: earlierPage, index: earlierPageIndex, count: earlierPageCount },
    { page: newerPage, index: newerPageIndex, count: newerPageCount },
  );

  return {
    pages,
    pageIndex,
    mode,
    zoom,
    swipe,
    selectedRegion,
    showBoundingBoxes,
    showSemanticHighlights,
    blinkOn,
    showSettings,
    sensitivity,
    alignment,
    fullPageSide,
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
    fullPageIndex: fullPage.index,
    fullPage: fullPage.page,
    fullPageCount: fullPage.count,
    previewPage,
    selectPage,
    goToSourcePage,
    stepSourcePage,
    changeMode,
    setZoom,
    setSwipe,
    setSelectedRegion,
    setShowBoundingBoxes,
    setShowSemanticHighlights,
    setShowSettings,
    setSensitivity,
    setAlignment,
    setFullPageSide,
    setShowHelp,
  };
}
