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

/** Kept short: the rail shows this beside a page, and screen readers append it to a page description. */
const statusLabels: Record<NonNullable<DiffPage["status"]>, string> = {
  same: "No changes",
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  processing: "Comparing…",
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
  if (earlier !== undefined && newer !== undefined)
    return `Compare A page ${earlier} with B page ${newer}, ${statusLabel(status)}`;
  if (earlier !== undefined) return `A page ${earlier} was removed`;
  if (newer !== undefined) return `B page ${newer} was added`;
  return `Comparison row ${index + 1}, ${statusLabel(status)}`;
}

export function pageStatus(page: DiffPage): NonNullable<DiffPage["status"]> {
  if (page.status) return page.status;
  if (page.beforeSrc && page.afterSrc && page.diffSrc) return "changed";
  return "processing";
}

/**
 * The changes the current view can actually point at. Text mode highlights text
 * runs and every other mode highlights pixel regions, and the two counts differ,
 * so the rail, the counter, and next/previous all read the list that is on screen.
 */
export function pageChanges(page: DiffPage, mode: DiffViewMode): ReadonlyArray<{ readonly id: string }> {
  if (mode === "semantic-text") return page.semantic?.changes ?? [];
  return page.regions ?? [];
}

/** What the rail says about a page: its count when it changed, its state otherwise. */
export function statusText(page: DiffPage, status: NonNullable<DiffPage["status"]>, mode: DiffViewMode): string {
  const count = status === "changed" ? pageChanges(page, mode).length : 0;
  return count ? `${count} change${count === 1 ? "" : "s"}` : statusLabels[status];
}

export function statusLabel(status: NonNullable<DiffPage["status"]>): string {
  return statusLabels[status];
}

/** The absent side of an added or removed page; undefined means the page is still rendering. */
export function missingSideLabel(page: DiffPage, side: SourceSide): string | undefined {
  if (side === "earlier") return page.status === "added" ? "No earlier page — added page" : undefined;
  return page.status === "removed" ? "No newer page — removed page" : undefined;
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
  return pages.flatMap((page, index) =>
    !onlyChanged || index === selected || pageStatus(page) !== "same" || page.alignment === "moved" ? [index] : [],
  );
}
