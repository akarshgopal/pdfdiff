import type { ReportTotals } from "@pdfdiff/core";
import type { DiffComparison } from "./types.js";
import { reportForComparison } from "./export.js";

/**
 * Per-page status answers "did this page change". A reviewer opens the tool
 * asking a document-level question — how much changed, and how much of it is
 * real. The exported report already totals exactly that, so the summary bar
 * and a downloaded report can never disagree.
 */

export type ComparisonSummary = ReportTotals;

export function summarizeComparison(comparison: DiffComparison): ComparisonSummary {
  return reportForComparison(comparison).totals;
}

export function summaryHeadline(summary: ComparisonSummary): string {
  if (summary.changedPages + summary.addedPages + summary.removedPages + summary.movedPages === 0) {
    return "No differences detected at current settings";
  }
  if (summary.pages === 1 && summary.changedPages === 1 && !summary.addedPages && !summary.removedPages)
    return "1 page changed";
  const parts = [`${summary.changedPages} changed`];
  if (summary.addedPages) parts.push(`${summary.addedPages} added`);
  if (summary.removedPages) parts.push(`${summary.removedPages} removed`);
  if (summary.movedPages) parts.push(`${summary.movedPages} moved`);
  return `${parts.join(" · ")} of ${summary.pages} pages`;
}
