import { PAGE_MATCH_THRESHOLD } from "@pdfdiff/core";
import type { DiffPage, DiffRegionKind, DiffViewMode, RenderQuality, SourceSide } from "./types.js";

export const viewModes: ReadonlyArray<{ id: DiffViewMode; label: string; shortcut: string }> = [
  { id: "diff", label: "Overlay", shortcut: "1" },
  { id: "side-by-side", label: "Split", shortcut: "2" },
  { id: "swipe", label: "Swipe", shortcut: "3" },
  { id: "semantic-text", label: "Text", shortcut: "4" },
];

/** Text-mode highlight filter. Overlay, Split, and Swipe ignore this. */
export type TextChangeFilter = "all" | DiffRegionKind;

export const textChangeFilters: ReadonlyArray<{ id: TextChangeFilter; label: string }> = [
  { id: "all", label: "All text changes" },
  { id: "added", label: "Additions only" },
  { id: "removed", label: "Removals only" },
  { id: "changed", label: "Changes only" },
];

export function textChangeMatchesFilter(kind: DiffRegionKind, filter: TextChangeFilter): boolean {
  return filter === "all" || kind === filter;
}

export function filterTextChanges<T extends { readonly kind: DiffRegionKind }>(
  items: readonly T[],
  filter: TextChangeFilter,
): readonly T[] {
  return filter === "all" ? items : items.filter((item) => item.kind === filter);
}

export function nextTextFilter(current: TextChangeFilter, direction: 1 | -1): TextChangeFilter {
  const ids = textChangeFilters.map((item) => item.id);
  const index = ids.indexOf(current);
  return ids[(index + direction + ids.length) % ids.length]!;
}

/**
 * Additions live on the newer page, removals on the earlier page, and a
 * replacement is both. Hide the side that cannot show the active filter.
 */
export function textFilterShowsSide(filter: TextChangeFilter, side: SourceSide): boolean {
  if (filter === "all" || filter === "changed") return true;
  return filter === "added" ? side === "newer" : side === "earlier";
}

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
 * runs — further narrowed by the Text filter — and every other mode highlights
 * pixel regions. The rail, the counter, and next/previous all read this list.
 */
export function pageChanges(
  page: DiffPage,
  mode: DiffViewMode,
  textFilter: TextChangeFilter = "all",
): ReadonlyArray<{ readonly id: string }> {
  if (mode === "semantic-text") return filterTextChanges(page.semantic?.changes ?? [], textFilter);
  return page.regions ?? [];
}

/** Drop a selection the new Text filter would hide; Overlay/Split/Swipe keep it. */
export function selectedChangeAfterTextFilter(
  selected: string | null,
  page: DiffPage,
  mode: DiffViewMode,
  textFilter: TextChangeFilter,
): string | null {
  if (!selected) return null;
  return pageChanges(page, mode, textFilter).some((change) => change.id === selected) ? selected : null;
}

/** Overlay, Split, and Swipe walk visual regions; Text walks extracted-text edits. */
function changeGrain(mode: DiffViewMode): "area" | "text change" {
  return mode === "semantic-text" ? "text change" : "area";
}

function grainNoun(count: number, mode: DiffViewMode): string {
  const grain = changeGrain(mode);
  if (count === 1) return grain;
  return grain === "area" ? "areas" : "text changes";
}

/** Rail chip: the on-page count in the active view's unit, never a bare "changes". */
function changeCountLabel(count: number, mode: DiffViewMode): string {
  return `${count} ${grainNoun(count, mode)}`;
}

/**
 * Walker copy. `selectedIndex` is -1 when nothing is selected, matching
 * Array#findIndex. The unit is named so this string cannot be read as pages.
 */
export function changeWalkerLabel(count: number, selectedIndex: number, mode: DiffViewMode): string {
  if (selectedIndex < 0) return `${changeCountLabel(count, mode)} on this page`;
  const name = changeGrain(mode) === "area" ? "Area" : "Text change";
  return `${name} ${selectedIndex + 1} of ${count} on this page`;
}

/** What the rail says about a page: its count when it changed, its state otherwise. */
export function statusText(
  page: DiffPage,
  status: NonNullable<DiffPage["status"]>,
  mode: DiffViewMode,
  textFilter: TextChangeFilter = "all",
): string {
  const count = status === "changed" ? pageChanges(page, mode, textFilter).length : 0;
  return count ? changeCountLabel(count, mode) : statusLabels[status];
}

function statusLabel(status: NonNullable<DiffPage["status"]>): string {
  return statusLabels[status];
}

/** The absent side of an added or removed page; undefined means the page is still rendering. */
export function missingSideLabel(page: DiffPage, side: SourceSide): string | undefined {
  if (side === "earlier") return page.status === "added" ? "No earlier page — added page" : undefined;
  return page.status === "removed" ? "No newer page — removed page" : undefined;
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

/** Shown next to a temporary pair that looks unrelated to the document pairing. */
export const MISPAIR_CUE = "These pages may not match";

/** Pixel change below this can still be an edit of the same page. */
const MISPAIR_CHANGE_FLOOR = 25;
/** Temporary pair must be this many times the typical document pair. */
const MISPAIR_CHANGE_RATIO = 3;
/** And this many points above typical, so a quiet document does not trip on a modest edit. */
const MISPAIR_CHANGE_DELTA = 20;
/** Jaccard on a handful of tokens is noise; fall through to visual density. */
const MISPAIR_MIN_TOKENS = 8;

function isDocumentPair(page: DiffPage, documentPages: readonly DiffPage[]): boolean {
  return documentPages.some(
    (entry) => entry.earlierPageNumber === page.earlierPageNumber && entry.newerPageNumber === page.newerPageNumber,
  );
}

function hasStableText(page: DiffPage): boolean {
  const semantic = page.semantic;
  return Boolean(
    semantic &&
    semantic.textUndecodable !== true &&
    semantic.hasBeforeText &&
    semantic.hasAfterText &&
    semantic.beforeTokenCount >= MISPAIR_MIN_TOKENS &&
    semantic.afterTokenCount >= MISPAIR_MIN_TOKENS,
  );
}

function typicalDocumentChangePercent(pages: readonly DiffPage[]): number | undefined {
  const values = pages
    .filter((page) => page.earlierPageNumber !== undefined && page.newerPageNumber !== undefined)
    .map((page) => page.changedPercent)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  if (values.length === 0) return undefined;
  return values[Math.floor(values.length / 2)];
}

function visuallyUnrelated(page: DiffPage, documentPages: readonly DiffPage[]): boolean {
  const changedPercent = page.changedPercent;
  if (changedPercent === undefined || changedPercent < MISPAIR_CHANGE_FLOOR) return false;
  const typical = typicalDocumentChangePercent(documentPages);
  if (typical === undefined) return true;
  return changedPercent >= typical * MISPAIR_CHANGE_RATIO && changedPercent >= typical + MISPAIR_CHANGE_DELTA;
}

/**
 * A temporary pair is suspicious when the aligner would not have matched it, or
 * when there is no text to ask and the visual rewrite is far above the document's
 * usual pairing.
 */
export function isLikelyMispair(page: DiffPage, documentPages: readonly DiffPage[]): boolean {
  if (page.status === "processing" || page.status === "error") return false;
  if (page.earlierPageNumber === undefined || page.newerPageNumber === undefined) return false;
  if (isDocumentPair(page, documentPages)) return false;
  if (hasStableText(page) && page.similarity !== undefined) {
    return page.similarity < PAGE_MATCH_THRESHOLD;
  }
  return visuallyUnrelated(page, documentPages);
}

export function temporaryPairCue(page: DiffPage, documentPages: readonly DiffPage[]): string | null {
  return isLikelyMispair(page, documentPages) ? MISPAIR_CUE : null;
}

/** Pages a reviewer would count as changed, including moves that stayed identical. */
export function changedPageCount(pages: readonly DiffPage[]): number {
  return pages.reduce((count, page) => {
    const status = pageStatus(page);
    if (status === "processing" || status === "error") return count;
    return count + (status !== "same" || page.alignment === "moved" ? 1 : 0);
  }, 0);
}

/** Compact location for the collapsed page rail; names pages, not areas. */
export function collapsedRailSummary(pageIndex: number, pageCount: number, changed: number): string {
  const current = `Page ${pageIndex + 1} of ${pageCount}`;
  if (changed <= 0) return current;
  return `${current} · ${changed === 1 ? "1 changed" : `${changed} changed`}`;
}

const textFilterEmptyStatus: Record<TextChangeFilter, string> = {
  all: "No semantic text changes",
  added: "No added text on this page",
  removed: "No removed text on this page",
  changed: "No changed text on this page",
};

/**
 * Status the change walker cannot show: unreadable text, or nothing matching
 * the Text filter. An empty status means the walker already names the count.
 */
export function semanticSummary(
  semantic: DiffPage["semantic"],
  textFilter: TextChangeFilter,
): { status: string; detail: string } {
  if (!semantic) return { status: "No semantic text changes", detail: "Native PDF rendering" };
  if (semantic.textUndecodable === true) {
    return { status: "Text could not be read", detail: "Embedded font has no Unicode mapping" };
  }
  const count = filterTextChanges(semantic.changes, textFilter).length;
  if (count) return { status: "", detail: "" };
  return { status: textFilterEmptyStatus[textFilter], detail: "" };
}

/** Text mode empty state when the page has no extractable text. */
export function missingSelectableTextNotice(page: DiffPage): { title: string; detail: string } | null {
  const semantic = page.semantic;
  if (!semantic || semantic.textUndecodable) return null;
  if (semantic.hasBeforeText || semantic.hasAfterText) return null;
  return {
    title: "No selectable text on this page",
    detail: "Overlay, Split, and Swipe still compare this page visually.",
  };
}
