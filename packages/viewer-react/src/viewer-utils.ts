import type { DiffPage, DiffViewMode, SourceSide } from "./types.js";

export const viewModes: ReadonlyArray<{ id: DiffViewMode; label: string; shortcut: string }> = [
  { id: "diff", label: "Diff", shortcut: "1" },
  { id: "semantic-text", label: "Semantic text", shortcut: "2" },
  { id: "side-by-side", label: "Side by side", shortcut: "3" },
  { id: "swipe", label: "Swipe", shortcut: "4" },
  { id: "blink", label: "Blink", shortcut: "5" },
  { id: "earlier", label: "Earlier", shortcut: "6" },
  { id: "newer", label: "Newer", shortcut: "7" },
];

export const zoomLevels = [50, 75, 100, 125, 150, 200] as const;

export function pageStatus(page: DiffPage): NonNullable<DiffPage["status"]> {
  if (page.status) return page.status;
  if (page.beforeSrc && page.afterSrc && page.diffSrc) return "changed";
  return "processing";
}

export function statusSymbol(status: NonNullable<DiffPage["status"]>): string {
  if (status === "same") return "✓";
  if (status === "added") return "+";
  if (status === "removed") return "−";
  if (status === "error") return "!";
  return "•";
}

export function statusLabel(status: NonNullable<DiffPage["status"]>): string {
  if (status === "same") return "No changes";
  if (status === "added") return "Added page";
  if (status === "removed") return "Removed page";
  if (status === "error") return "Error";
  if (status === "processing") return "Processing";
  return "Changes found";
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
