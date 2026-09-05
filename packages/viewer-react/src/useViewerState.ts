import { useCallback, useEffect, useState } from "react";
import type { DiffComparison, DiffPage, DiffViewMode, RenderQuality } from "./types.js";
import {
  clampPageIndex,
  pagePairNumbers,
  qualityForZoom,
  sourcePageCount,
  viewModes,
  visiblePageIndexes,
} from "./viewer-utils.js";
import { useViewerKeyboard } from "./useViewerKeyboard.js";

export function useViewerState({
  comparison,
  onSave,
  onlyChanged,
  modalOpen,
}: {
  comparison: DiffComparison;
  onSave?: () => void;
  onlyChanged: boolean;
  modalOpen: boolean;
}) {
  const pages = comparison.pages;
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<DiffViewMode>("diff");
  const [zoom, setZoom] = useState(100);
  const [swipe, setSwipe] = useState(50);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [quality, setQuality] = useState<RenderQuality>("standard");
  const [manualPair, setManualPair] = useState<{ earlier: number; newer: number } | null>(null);
  const [resolution, setResolution] = useState<{
    comparison: DiffComparison;
    key: string;
    quality: RenderQuality;
    page?: DiffPage;
    error?: string;
  } | null>(null);
  const currentPage = pages[pageIndex];
  const pair = manualPair ?? pagePairNumbers(currentPage);
  const pairKey = `${pageIndex}:${pair.earlier}:${pair.newer}`;
  const resolved = resolution?.comparison === comparison && resolution.key === pairKey ? resolution : null;
  const previewPage =
    resolved?.page ??
    (manualPair
      ? {
          index: pageIndex,
          earlierPageNumber: pair.earlier,
          newerPageNumber: pair.newer,
          status: "processing" as const,
        }
      : currentPage);
  const canResolve = Boolean(comparison.comparePagePair && pair.earlier && pair.newer);
  const needsResolution =
    canResolve &&
    resolved?.quality !== quality &&
    (Boolean(manualPair) || quality === "high" || Boolean(resolved) || (mode === "diff" && !currentPage?.layers));
  const visibleIndexes = visiblePageIndexes(pages, onlyChanged, pageIndex);
  const position = visibleIndexes.indexOf(pageIndex);
  const selectPage = useCallback(
    (index: number) => {
      setPageIndex(clampPageIndex(index, pages.length));
      setManualPair(null);
      setSelectedRegion(null);
    },
    [pages.length],
  );
  const stepPage = (direction: 1 | -1) => {
    const next = visibleIndexes[position + direction];
    if (next !== undefined) selectPage(next);
  };
  const changeZoom = (next: number) => {
    setZoom(next);
    setQuality((current) => qualityForZoom(next, current));
  };
  const changePair = (earlier: number, newer: number) => {
    setManualPair({ earlier, newer });
    setSelectedRegion(null);
  };
  useEffect(() => {
    if (!needsResolution || !comparison.comparePagePair || !pair.earlier || !pair.newer) return;
    const controller = new AbortController();
    void comparison
      .comparePagePair({
        earlierPageIndex: pair.earlier - 1,
        newerPageIndex: pair.newer - 1,
        quality,
        signal: controller.signal,
      })
      .then((page) => {
        if (!controller.signal.aborted) setResolution({ comparison, key: pairKey, quality, page });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResolution({
            comparison,
            key: pairKey,
            quality,
            error: error instanceof Error ? error.message : "Unable to compare these pages.",
          });
      });
    return () => controller.abort();
  }, [comparison, needsResolution, pair.earlier, pair.newer, pairKey, quality]);
  useViewerKeyboard({
    enabled: !showHelp && !modalOpen,
    onStepPage: stepPage,
    onBoundary: (last) => selectPage(visibleIndexes[last ? visibleIndexes.length - 1 : 0] ?? pageIndex),
    onClearSelection: () => setSelectedRegion(null),
    onChangeMode: setMode,
    onCycleMode: (direction) =>
      setMode(
        viewModes[(viewModes.findIndex((item) => item.id === mode) + direction + viewModes.length) % viewModes.length]!
          .id,
      ),
    zoom,
    onZoomChange: changeZoom,
    onSave,
    onShowHelp: () => setShowHelp(true),
  });
  return {
    pages,
    pageIndex,
    mode,
    zoom,
    swipe,
    selectedRegion,
    showHelp,
    currentPage,
    previewPage,
    earlierPageCount: comparison.earlierPageCount ?? sourcePageCount(pages, "earlier"),
    newerPageCount: comparison.newerPageCount ?? sourcePageCount(pages, "newer"),
    pair,
    pairKey,
    manualPair,
    changePair,
    selectPage,
    stepPage,
    hasPreviousPage: position > 0,
    hasNextPage: position < visibleIndexes.length - 1,
    pairComparisonPending: Boolean(manualPair && !resolved),
    pairError: resolved?.error ?? previewPage?.error ?? null,
    changeMode: setMode,
    setZoom: changeZoom,
    setSwipe,
    setSelectedRegion,
    setShowHelp,
  };
}
