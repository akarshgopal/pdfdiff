import type { ReportTotals } from "@pdfdiff/core";
import type { DiffComparison } from "./types.js";
import { reportForComparison } from "./export.js";

/**
 * The document-level answer is always a page story. On-page region and
 * text-change counts name their own grain, so they cannot be mistaken for
 * a second headline.
 */

export type ComparisonSummary = ReportTotals;

export function summarizeComparison(comparison: DiffComparison): ComparisonSummary {
  return reportForComparison(comparison).totals;
}

function pageStat(count: number, verb: string): string {
  return count === 1 ? `1 page ${verb}` : `${count} pages ${verb}`;
}

/** A lone stat can carry the document size; several stats each already name pages. */
function pageStory(count: number, total: number, verb: string): string {
  if (count === total) return pageStat(count, verb);
  return `${count} of ${total} pages ${verb}`;
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
