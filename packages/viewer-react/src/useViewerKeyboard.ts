import { useEffect, useRef } from "react";
import type { DiffViewMode, SourceSide } from "./types.js";
import { clampZoom, toggleFullscreen, viewModes, ZOOM_STEP } from "./viewer-utils.js";

interface ViewerKeyboardOptions {
  readonly enabled: boolean;
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly earlierPageCount: number;
  readonly newerPageCount: number;
  readonly onSelectPage: (index: number) => void;
  readonly onStepChange: (direction: 1 | -1) => void;
  readonly onStepSourcePage: (side: SourceSide, direction: 1 | -1) => void;
  readonly onGoToSourcePage: (side: SourceSide, index: number) => void;
  readonly onClearSelection: () => void;
  readonly onChangeMode: (mode: DiffViewMode) => void;
  readonly onCycleMode: (direction: 1 | -1) => void;
  readonly zoom: number;
  readonly onZoomChange: (zoom: number) => void;
  readonly onSave?: () => void;
  readonly onShowHelp: () => void;
}

const zoomSteps: Record<string, number> = { "+": ZOOM_STEP, "=": ZOOM_STEP, "-": -ZOOM_STEP, _: -ZOOM_STEP };

function handleViewerAction(event: KeyboardEvent, options: ViewerKeyboardOptions): boolean {
  // Ctrl/Cmd + S and browser zoom stay with the browser.
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const step = zoomSteps[event.key];
  if (step !== undefined) {
    event.preventDefault();
    options.onZoomChange(clampZoom(options.zoom + step));
    return true;
  }
  if (event.key === "0") {
    event.preventDefault();
    options.onZoomChange(100);
    return true;
  }
  if (event.key === "?") {
    event.preventDefault();
    options.onShowHelp();
    return true;
  }
  const key = event.key.toLowerCase();
  if (key === "f") {
    event.preventDefault();
    toggleFullscreen();
    return true;
  }
  if (key === "s" && options.onSave) {
    event.preventDefault();
    options.onSave();
    return true;
  }
  return false;
}

const forwardKeys = new Set(["arrowright", "pagedown", "j"]);
const backwardKeys = new Set(["arrowleft", "pageup", "k"]);

/**
 * Stepping one page at a time through a long document to find the handful that
 * changed is the slow part of a review, so n/p skip straight to them and the
 * plain page keys stay available for reading around a change.
 */
function handleChangeStep(event: KeyboardEvent, options: ViewerKeyboardOptions): boolean {
  const key = event.key.toLowerCase();
  if (key !== "n" && key !== "p") return false;
  event.preventDefault();
  options.onStepChange(key === "n" ? 1 : -1);
  return true;
}

function sourceSideForEvent(event: KeyboardEvent): SourceSide | null {
  return event.shiftKey ? "earlier" : event.ctrlKey || event.metaKey ? "newer" : null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return element?.tagName === "INPUT" || element?.tagName === "SELECT" || Boolean(element?.isContentEditable) || element?.getAttribute("role") === "slider";
}

function stepDirection(key: string): 1 | -1 | null {
  if (forwardKeys.has(key)) return 1;
  if (backwardKeys.has(key)) return -1;
  return null;
}

function handlePageStep(event: KeyboardEvent, options: ViewerKeyboardOptions): boolean {
  const direction = stepDirection(event.key.toLowerCase());
  if (!direction) return false;
  event.preventDefault();
  const side = sourceSideForEvent(event);
  if (side) options.onStepSourcePage(side, direction);
  else options.onSelectPage(options.pageIndex + direction);
  return true;
}

function handleModeChange(event: KeyboardEvent, options: ViewerKeyboardOptions): boolean {
  const mode = viewModes.find((item) => item.shortcut === event.key);
  if (mode) {
    event.preventDefault();
    options.onChangeMode(mode.id);
    return true;
  }
  const direction = modeCycleDirection(event);
  if (!direction) return false;
  event.preventDefault();
  options.onCycleMode(direction);
  return true;
}

function modeCycleDirection(event: KeyboardEvent): 1 | -1 | null {
  if (event.key === "[" || event.key === "{") return -1;
  if (event.key === "]" || event.key === "}") return 1;
  if (event.key.toLowerCase() === "m") return event.shiftKey ? -1 : 1;
  return null;
}

function handleBoundary(event: KeyboardEvent, options: ViewerKeyboardOptions): boolean {
  if (event.key !== "Home" && event.key !== "End") return false;
  event.preventDefault();
  const firstPage = event.key === "Home";
  const side = sourceSideForEvent(event);
  if (!side) options.onSelectPage(firstPage ? 0 : options.pageCount - 1);
  else if (side === "earlier") options.onGoToSourcePage(side, firstPage ? 0 : options.earlierPageCount - 1);
  else options.onGoToSourcePage(side, firstPage ? 0 : options.newerPageCount - 1);
  return true;
}

function handleKeyDown(event: KeyboardEvent, options: ViewerKeyboardOptions): void {
  if (isEditableTarget(event.target)) return;
  if (handleChangeStep(event, options) || handlePageStep(event, options) || handleModeChange(event, options) || handleBoundary(event, options) || handleViewerAction(event, options)) return;
  if (event.key === "Escape") options.onClearSelection();
}

export function useViewerKeyboard(options: ViewerKeyboardOptions): void {
  // The handler reads the latest props through a ref, so the window listener is
  // attached once per enable rather than re-bound on every render.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    if (!options.enabled) return;
    const listener = (event: KeyboardEvent) => handleKeyDown(event, latest.current);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [options.enabled]);
}
