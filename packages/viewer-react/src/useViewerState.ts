import { useCallback, useEffect, useMemo, useState } from "react";
import type { DiffComparison, DiffPage, DiffViewMode, SourceSide, ViewerOptions } from "./types.js";
import { buildPreviewPage, clampPageIndex, modeNeedsComparedPair, pageStatus, sourcePageCount, viewModes } from "./viewer-utils.js";
import { useViewerKeyboard } from "./useViewerKeyboard.js";

export function useViewerState({ comparison, initialOptions, onAnalytics }: { comparison: DiffComparison; initialOptions?: ViewerOptions; onAnalytics?: (event: { name: "view_mode_used"; mode: DiffViewMode }) => void }) {
  const pages = comparison.pages;
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<DiffViewMode>("diff");
  const [zoom, setZoom] = useState(100);
  const [swipe, setSwipe] = useState(50);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [showSemanticHighlights, setShowSemanticHighlights] = useState(true);
  const [blinkOn, setBlinkOn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sensitivity, setSensitivity] = useState(initialOptions?.sensitivity ?? 28);
  const [alignment, setAlignment] = useState<"none" | "translation">(initialOptions?.alignment ?? "none");
  const [fullPageSide, setFullPageSide] = useState<SourceSide | null>(null);
  const [earlierPageIndex, setEarlierPageIndex] = useState(0);
  const [newerPageIndex, setNewerPageIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [pairResolution, setPairResolution] = useState<{ comparison: DiffComparison; key: string; page?: DiffPage; error?: string } | null>(null);

  const earlierPageCount = sourcePageCount(pages, "earlier");
  const newerPageCount = sourcePageCount(pages, "newer");
  const currentPage = pages[pageIndex] ?? null;
  const earlierPage = pages[earlierPageIndex] ?? null;
  const newerPage = pages[newerPageIndex] ?? null;
  const sourcePagesAligned = earlierPageIndex === newerPageIndex;
  const pairKey = `${earlierPageIndex}:${newerPageIndex}`;
  const pairComparisonMode = modeNeedsComparedPair(mode);
  const alignedPairPage = sourcePagesAligned ? pages[earlierPageIndex] ?? null : null;
  const pairResolutionMatches = pairResolution?.comparison === comparison && pairResolution.key === pairKey;
  const resolvedPairPage = !sourcePagesAligned && pairResolutionMatches ? pairResolution.page ?? null : null;
  const resolvedPairError = !sourcePagesAligned && pairResolutionMatches ? pairResolution.error ?? null : null;
  const pairError = pairComparisonMode && !sourcePagesAligned
    ? resolvedPairError ?? (comparison.comparePagePair ? null : "This comparison source cannot calculate a diff for independently selected pages.")
    : null;
  const comparisonPairPage = alignedPairPage ?? resolvedPairPage;
  const changedPages = useMemo(() => pages.filter((page) => pageStatus(page) !== "same"), [pages]);

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
    if (!pairComparisonMode || sourcePagesAligned || resolvedPairPage || resolvedPairError || !comparison.comparePagePair) return;

    const abortController = new AbortController();
    void comparison.comparePagePair({ earlierPageIndex, newerPageIndex, signal: abortController.signal }).then((page) => {
      if (abortController.signal.aborted) return;
      setPairResolution({ comparison, key: pairKey, page });
    }).catch((error: unknown) => {
      if (abortController.signal.aborted) return;
      setPairResolution({ comparison, key: pairKey, error: error instanceof Error ? error.message : "Unable to compare the selected pages." });
    });
    return () => abortController.abort();
  }, [comparison, earlierPageIndex, newerPageIndex, pairComparisonMode, pairKey, resolvedPairError, resolvedPairPage, sourcePagesAligned]);

  useViewerKeyboard({ enabled: !showHelp, pageIndex, pageCount: pages.length, earlierPageCount, newerPageCount, fullPageSide, onSelectPage: selectPage, onStepSourcePage: stepSourcePage, onGoToSourcePage: goToSourcePage, onCloseFullPage: () => setFullPageSide(null), onClearSelection: () => setSelectedRegion(null), onChangeMode: changeMode, onCycleMode: cycleMode });

  const goToNextChange = useCallback(() => {
    const next = pages.findIndex((page, index) => index > pageIndex && pageStatus(page) !== "same");
    const fallback = pages.findIndex((page) => pageStatus(page) !== "same");
    selectPage(next >= 0 ? next : fallback >= 0 ? fallback : pageIndex);
  }, [pageIndex, pages, selectPage]);

  const previewPage = buildPreviewPage({ mode, currentPage, earlierPage, newerPage, comparisonPairPage });
  const pairComparisonPending = pairComparisonMode && !sourcePagesAligned && !resolvedPairPage && !pairError;

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
    changedPages,
    fullPageIndex: fullPageSide === "earlier" ? earlierPageIndex : newerPageIndex,
    fullPage: fullPageSide === "earlier" ? earlierPage : newerPage,
    fullPageCount: fullPageSide === "earlier" ? earlierPageCount : newerPageCount,
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
    goToNextChange,
  };
}
