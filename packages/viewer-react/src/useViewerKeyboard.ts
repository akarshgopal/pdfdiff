import { useEffect } from "react";
import type { DiffViewMode, SourceSide } from "./types.js";
import { viewModes } from "./viewer-utils.js";

interface ViewerKeyboardOptions {
  readonly enabled: boolean;
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly earlierPageCount: number;
  readonly newerPageCount: number;
  readonly fullPageSide: SourceSide | null;
  readonly onSelectPage: (index: number) => void;
  readonly onStepSourcePage: (side: SourceSide, direction: 1 | -1) => void;
  readonly onGoToSourcePage: (side: SourceSide, index: number) => void;
  readonly onCloseFullPage: () => void;
  readonly onClearSelection: () => void;
  readonly onChangeMode: (mode: DiffViewMode) => void;
  readonly onCycleMode: (direction: 1 | -1) => void;
}

function sourceSideForEvent(event: KeyboardEvent, fullPageSide: SourceSide | null): SourceSide | null {
  return event.shiftKey ? "earlier" : event.ctrlKey || event.metaKey ? "newer" : fullPageSide;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return element?.tagName === "INPUT" || element?.tagName === "SELECT" || Boolean(element?.isContentEditable) || element?.getAttribute("role") === "slider";
}

export function useViewerKeyboard({ enabled, pageIndex, pageCount, earlierPageCount, newerPageCount, fullPageSide, onSelectPage, onStepSourcePage, onGoToSourcePage, onCloseFullPage, onClearSelection, onChangeMode, onCycleMode }: ViewerKeyboardOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "Escape" && fullPageSide) {
        event.preventDefault();
        onCloseFullPage();
        return;
      }

      const key = event.key.toLowerCase();
      const direction = ["arrowright", "pagedown", "j", "n"].includes(key) ? 1 : ["arrowleft", "pageup", "k", "p"].includes(key) ? -1 : 0;
      if (direction) {
        event.preventDefault();
        const side = sourceSideForEvent(event, fullPageSide);
        if (side) onStepSourcePage(side, direction as 1 | -1);
        else onSelectPage(pageIndex + direction);
        return;
      }

      const mode = viewModes.find((item) => item.shortcut === event.key);
      if (mode) {
        event.preventDefault();
        onChangeMode(mode.id);
      } else if (event.key === "[" || event.key === "{") {
        event.preventDefault();
        onCycleMode(-1);
      } else if (event.key === "]" || event.key === "}") {
        event.preventDefault();
        onCycleMode(1);
      } else if (key === "m") {
        event.preventDefault();
        onCycleMode(event.shiftKey ? -1 : 1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const side = sourceSideForEvent(event, fullPageSide);
        if (side) onGoToSourcePage(side, event.key === "Home" ? 0 : side === "earlier" ? earlierPageCount - 1 : newerPageCount - 1);
        else onSelectPage(event.key === "Home" ? 0 : pageCount - 1);
      } else if (event.key === "Escape") {
        onClearSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, pageIndex, pageCount, earlierPageCount, newerPageCount, fullPageSide, onSelectPage, onStepSourcePage, onGoToSourcePage, onCloseFullPage, onClearSelection, onChangeMode, onCycleMode]);
}
