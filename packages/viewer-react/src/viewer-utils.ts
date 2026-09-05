import type { DiffPage, DiffViewMode, RenderQuality, SourceSide } from "./types.js";

export const viewModes: ReadonlyArray<{ id: DiffViewMode; label: string; shortcut: string }> = [
  { id: "diff", label: "Overlay", shortcut: "1" },
  { id: "side-by-side", label: "Split", shortcut: "2" },
  { id: "swipe", label: "Swipe", shortcut: "3" },
  { id: "semantic-text", label: "Text", shortcut: "4" },
];

export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
export const ZOOM_STEP = 25;

/** The browser owns fullscreen; the viewer only asks for it. */
export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

/**
 * Zoom past this asks for the high-resolution re-render, and only a drop back
 * below the lower bound cancels it — the gap keeps a wheel hovering around the
 * threshold from re-rendering on every notch.
 */
export function qualityForZoom(zoom: number, current: RenderQuality): RenderQuality {
  if (zoom >= 150) return "high";
  return zoom <= 125 ? "standard" : current;
}

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
}

const statusSymbols: Record<NonNullable<DiffPage["status"]>, string> = {
  same: "✓",
  added: "+",
  removed: "−",
  changed: "•",
  processing: "•",
  error: "!",
};

const statusLabels: Record<NonNullable<DiffPage["status"]>, string> = {
  same: "No changes",
  added: "Added page",
  removed: "Removed page",
  changed: "Changes found",
  processing: "Processing",
  error: "Error",
};

/** Name a rail row by the source pages it actually pairs, not by its position. */
export function pagePairLabel(page: DiffPage, index: number): string {
  const earlier = page.earlierPageNumber;
  const newer = page.newerPageNumber;
  if (earlier !== undefined && newer !== undefined) return `A ${earlier} ↔ B ${newer}`;
  if (earlier !== undefined) return `A ${earlier} ↔ —`;
  if (newer !== undefined) return `— ↔ B ${newer}`;
  return `A ${index + 1} ↔ B ${index + 1}`;
}

export function pagePairDescription(page: DiffPage, index: number, status: NonNullable<DiffPage["status"]>): string {
  const earlier = page.earlierPageNumber;
  const newer = page.newerPageNumber;
  if (page.alignment === "moved" && earlier !== undefined && newer !== undefined) {
    return `Page moved from A ${earlier} to B ${newer}, ${statusLabel(status)}`;
  }
  if (earlier !== undefined && newer !== undefined) return `Compare A page ${earlier} with B page ${newer}, ${statusLabel(status)}`;
  if (earlier !== undefined) return `A page ${earlier} was removed`;
  if (newer !== undefined) return `B page ${newer} was added`;
  return `Comparison row ${index + 1}, ${statusLabel(status)}`;
}

export function pageStatus(page: DiffPage): NonNullable<DiffPage["status"]> {
  if (page.status) return page.status;
  if (page.beforeSrc && page.afterSrc && page.diffSrc) return "changed";
  return "processing";
}

export function statusSymbol(status: NonNullable<DiffPage["status"]>): string {
  return statusSymbols[status];
}

export function statusLabel(status: NonNullable<DiffPage["status"]>): string {
  return statusLabels[status];
}

export function sourceForSide(page: DiffPage | null | undefined, side: SourceSide): string | undefined {
  return side === "earlier" ? page?.beforeSrc : page?.afterSrc;
}

export function sourcePageCount(pages: ReadonlyArray<DiffPage>, side: SourceSide): number {
  return pages.reduce((count, page) => Math.max(count, pagePairNumbers(page)[side] ?? 0), 0);
}

export function clampPageIndex(index: number, pageCount: number): number {
  return Math.min(Math.max(0, index), Math.max(0, pageCount - 1));
}

export function pagePairNumbers(page: DiffPage | undefined): { earlier?: number; newer?: number } {
  if (!page) return {};
  if (page.earlierPageNumber !== undefined || page.newerPageNumber !== undefined) {
    return { earlier: page.earlierPageNumber, newer: page.newerPageNumber };
  }
  return { earlier: page.beforeSrc ? page.index + 1 : undefined, newer: page.afterSrc ? page.index + 1 : undefined };
}

export function visiblePageIndexes(pages: readonly DiffPage[], onlyChanged: boolean, selected: number): number[] {
  return pages.flatMap((page, index) => !onlyChanged || index === selected || pageStatus(page) !== "same" || page.alignment === "moved" ? [index] : []);
}
