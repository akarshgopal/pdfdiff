import type { DiffPage, DiffViewMode, SourceSide } from "./types.js";

export const viewModes: ReadonlyArray<{ id: DiffViewMode; label: string; shortcut: string }> = [
  { id: "diff", label: "Overlay", shortcut: "1" },
  { id: "side-by-side", label: "Split", shortcut: "2" },
  { id: "swipe", label: "Swipe", shortcut: "3" },
  { id: "semantic-text", label: "Text", shortcut: "4" },
];

const normalizedPairModes = new Set<DiffViewMode>(["diff", "semantic-text", "swipe", "blink"]);

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

export function modeNeedsComparedPair(mode: DiffViewMode): boolean {
  return normalizedPairModes.has(mode);
}

function previewSources(mode: DiffViewMode, comparisonPairPage: DiffPage | null, earlierPage: DiffPage | null, newerPage: DiffPage | null): Pick<DiffPage, "beforeSrc" | "afterSrc"> {
  if (modeNeedsComparedPair(mode) && comparisonPairPage) {
    return { beforeSrc: comparisonPairPage.beforeSrc, afterSrc: comparisonPairPage.afterSrc };
  }
  return {
    beforeSrc: earlierPage ? earlierPage.beforeSrc : undefined,
    afterSrc: newerPage ? newerPage.afterSrc : undefined,
  };
}

function comparisonDetails(page: DiffPage | null): Partial<DiffPage> {
  if (!page) return {
    diffSrc: undefined,
    status: "processing",
    changedPixels: undefined,
    changedPercent: undefined,
    regions: [],
    textChanges: [],
    textChangeCount: 0,
    semantic: undefined,
    semanticBeforeOverlays: undefined,
    semanticAfterOverlays: undefined,
    error: undefined,
  };
  const { diffSrc, status, changedPixels, changedPercent, regions, textChanges, textChangeCount, semantic, semanticBeforeOverlays, semanticAfterOverlays, error } = page;
  return { diffSrc, status, changedPixels, changedPercent, regions: regions ?? [], textChanges: textChanges ?? [], textChangeCount: textChangeCount ?? 0, semantic, semanticBeforeOverlays, semanticAfterOverlays, error };
}

export function buildPreviewPage({ mode, currentPage, earlierPage, newerPage, comparisonPairPage }: {
  mode: DiffViewMode;
  currentPage: DiffPage | null;
  earlierPage: DiffPage | null;
  newerPage: DiffPage | null;
  comparisonPairPage: DiffPage | null;
}): DiffPage | null {
  const previewBase = comparisonPairPage ?? currentPage ?? earlierPage ?? newerPage;
  if (!previewBase) return null;
  return {
    ...previewBase,
    ...previewSources(mode, comparisonPairPage, earlierPage, newerPage),
    ...comparisonDetails(comparisonPairPage),
  };
}

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
  return pages.reduce((lastPage, page, index) => sourceForSide(page, side) ? index + 1 : lastPage, 0);
}

export function clampPageIndex(index: number, pageCount: number): number {
  return Math.min(Math.max(0, index), Math.max(0, pageCount - 1));
}

export function adjacentChangedPageIndex(pages: ReadonlyArray<DiffPage>, pageIndex: number, direction: 1 | -1): number {
  if (pages.length === 0) return pageIndex;
  for (let offset = 1; offset <= pages.length; offset += 1) {
    const candidate = (pageIndex + direction * offset + pages.length) % pages.length;
    if (pageStatus(pages[candidate]!) !== "same") return candidate;
  }
  return pageIndex;
}
