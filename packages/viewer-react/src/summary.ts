import type { ReportTotals } from "@pdfdiff/core";
import type { DiffComparison, DiffPage } from "./types.js";
import { reportForComparison } from "./export.js";
import { pageStatus } from "./viewer-utils.js";

/**
 * The document-level answer is always a page story. On-page region and
 * text-change counts name their own grain, so they cannot be mistaken for
 * a second headline. That story is only ready once every row has a settled
 * status — partial totals look like the same sentence.
 */

export type ComparisonSummary = ReportTotals;
export type ComparisonProgress = { readonly completed: number; readonly total: number };

export function summarizeComparison(comparison: DiffComparison): ComparisonSummary {
  return reportForComparison(comparison).totals;
}

/**
 * Absent once every page has a verdict. Completed is counted from settled
 * rows so the headline cannot lag the rail as pages stream in.
 */
export function comparisonProgress(
  pages: readonly DiffPage[],
  reported?: ComparisonProgress,
): ComparisonProgress | undefined {
  if (pages.length === 0) return reported;
  const pending = pages.filter((page) => pageStatus(page) === "processing").length;
  if (pending === 0) return undefined;
  return { completed: pages.length - pending, total: Math.max(reported?.total ?? 0, pages.length) };
}

function pageStat(count: number, verb: string): string {
  return count === 1 ? `1 page ${verb}` : `${count} pages ${verb}`;
}

/** A lone stat can carry the document size; several stats each already name pages. */
function pageStory(count: number, total: number, verb: string): string {
  if (count === total) return pageStat(count, verb);
  return `${count} of ${total} pages ${verb}`;
}

/**
 * Document-level text warnings. Unreadable fonts are a trust issue — Text mode
 * cannot run on those pages — so they stay visible with an action. Pages that
 * simply have no selectable text are already compared visually; Text mode
 * explains itself on those pages, and a header chip does not help.
 */
export function headerTextWarning(summary: ComparisonSummary): { message: string; title: string } | null {
  if (!summary.pagesWithUnreadableText) return null;
  return {
    message: `Text comparison unavailable on ${summary.pagesWithUnreadableText} of ${summary.pages} pages`,
    title: "These pages embed fonts with no Unicode mapping. Overlay, Split, and Swipe still apply.",
  };
}

export function summaryHeadline(summary: ComparisonSummary): string {
  const { changedPages, addedPages, removedPages, movedPages, pages } = summary;
  if (changedPages + addedPages + removedPages + movedPages === 0) {
    return "No differences detected at current settings";
  }
  const parts: string[] = [];
  if (changedPages) parts.push(pageStat(changedPages, "changed"));
  if (addedPages) parts.push(pageStat(addedPages, "added"));
  if (removedPages) parts.push(pageStat(removedPages, "removed"));
  if (movedPages) parts.push(pageStat(movedPages, "moved"));
  if (parts.length === 1) {
    const verb = changedPages ? "changed" : addedPages ? "added" : removedPages ? "removed" : "moved";
    const count = changedPages || addedPages || removedPages || movedPages;
    return pageStory(count, pages, verb);
  }
  return parts.join(" · ");
}

export function workspaceHeadline(summary: ComparisonSummary, progress?: ComparisonProgress): string {
  if (progress) return `Comparing ${progress.completed} of ${progress.total} pages…`;
  return summaryHeadline(summary);
}
