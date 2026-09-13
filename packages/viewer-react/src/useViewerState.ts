import { useCallback, useEffect, useState } from "react";
import { DEFAULT_OVERLAY, rgbToHex } from "@pdfdiff/core";
import type {
  DiffComparison,
  DiffPage,
  DiffViewMode,
  OverlayStyle,
  RenderQuality,
  SourceSide,
  ViewerSettings,
} from "./types.js";
import {
  clampPageIndex,
  pagePairNumbers,
  qualityForZoom,
  selectedChangeAfterTextFilter,
  sourcePageCount,
  viewModes,
  visiblePageIndexes,
  type TextChangeFilter,
} from "./viewer-utils.js";
import { useViewerKeyboard } from "./useViewerKeyboard.js";
import { downloadPageImage } from "./export.js";

export type ViewerModal = "help" | "settings" | "pairing" | null;

const DEFAULT_SETTINGS: ViewerSettings = { showBoundingBoxes: false, onlyChanged: false };

export const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  addedColor: rgbToHex(DEFAULT_OVERLAY.addedColor),
  removedColor: rgbToHex(DEFAULT_OVERLAY.removedColor),
  modifiedColor: rgbToHex(DEFAULT_OVERLAY.modifiedColor),
  unchangedOpacity: DEFAULT_OVERLAY.unchangedOpacity,
};

export function useViewerState({
  comparison,
  defaultOverlay,
  onOverlayChange,
}: {
  comparison: DiffComparison;
  defaultOverlay?: OverlayStyle;
  onOverlayChange?: (overlay: OverlayStyle) => void;
}) {
  const pages = comparison.pages;
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<DiffViewMode>("diff");
  const [zoom, setZoom] = useState(100);
  const [swipe, setSwipe] = useState(50);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayStyle>(defaultOverlay ?? DEFAULT_OVERLAY_STYLE);
  const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);
  const [textFilter, setTextFilter] = useState<TextChangeFilter>("all");
  const [modal, setModal] = useState<ViewerModal>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [manualPair, setManualPair] = useState<{ earlier: number; newer: number } | null>(null);
  const [resolution, setResolution] = useState<{
    comparison: DiffComparison;
    key: string;
    quality: RenderQuality;
    page?: DiffPage;
    error?: string;
  } | null>(null);
  const [quality, setQuality] = useState<RenderQuality>("standard");
  const currentPage = pages[pageIndex];
  const pair = manualPair ?? pagePairNumbers(currentPage);
  const withLayers = mode === "diff" || quality === "high" || Boolean(manualPair);
  const pairKey = `${pair.earlier}:${pair.newer}:${quality}:${withLayers}`;
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
  const needsResolution = canResolve && !resolved;
  const visibleIndexes = visiblePageIndexes(pages, settings.onlyChanged, pageIndex);
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
    setModal(null);
  };
  const changeOverlay = (next: OverlayStyle): void => {
    setOverlay(next);
    onOverlayChange?.(next);
  };
  const changeTextFilter = (next: TextChangeFilter) => {
    setSelectedRegion(selectedChangeAfterTextFilter(selectedRegion, previewPage, mode, next));
    setTextFilter(next);
  };
  const changeMode = (next: DiffViewMode) => {
    setSelectedRegion(null);
    setMode(next);
  };
  const sourceCounts = {
    earlier: comparison.earlierPageCount ?? sourcePageCount(pages, "earlier"),
    newer: comparison.newerPageCount ?? sourcePageCount(pages, "newer"),
  };
  const goToSourcePage = (side: SourceSide, page: number) => {
    const next = { earlier: pair.earlier ?? 1, newer: pair.newer ?? 1 };
    next[side] = Math.min(Math.max(1, page), Math.max(1, sourceCounts[side]));
    changePair(next.earlier, next.newer);
  };
  useEffect(() => {
    if (!needsResolution || !comparison.comparePagePair || !pair.earlier || !pair.newer) return;
    const controller = new AbortController();
    void comparison
      .comparePagePair({
        earlierPageIndex: pair.earlier - 1,
        newerPageIndex: pair.newer - 1,
        quality,
        withLayers,
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
  }, [comparison, needsResolution, pair.earlier, pair.newer, pairKey, quality, withLayers]);
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useViewerKeyboard({
    enabled: modal === null,
    onStepPage: stepPage,
    onStepSourcePage: (side, direction) => goToSourcePage(side, (pair[side] ?? 1) + direction),
    onSourceBoundary: (side, last) => goToSourcePage(side, last ? sourceCounts[side] : 1),
    onBoundary: (last) => selectPage(visibleIndexes[last ? visibleIndexes.length - 1 : 0] ?? pageIndex),
    onClearSelection: () => setSelectedRegion(null),
    onChangeMode: changeMode,
    onCycleMode: (direction) =>
      changeMode(
        viewModes[(viewModes.findIndex((item) => item.id === mode) + direction + viewModes.length) % viewModes.length]!
          .id,
      ),
    zoom,
    onZoomChange: changeZoom,
    onSave: () => {
      if (previewPage) void downloadPageImage(comparison, previewPage, overlay);
    },
    onShowHelp: () => setModal("help"),
  });
  return {
    pages,
    pageIndex,
    mode,
    zoom,
    swipe,
    selectedRegion,
    overlay,
    settings,
    textFilter,
    modal,
    railCollapsed,
    isFullscreen,
    currentPage,
    previewPage,
    earlierPageCount: sourceCounts.earlier,
    newerPageCount: sourceCounts.newer,
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
    changeMode,
    setZoom: changeZoom,
    setSwipe,
    setSelectedRegion,
    changeOverlay,
    setSettings,
    changeTextFilter,
    setModal,
    setRailCollapsed,
  };
}
