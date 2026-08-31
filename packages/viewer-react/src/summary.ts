import type { ReportTotals } from "@pdfdiff/core";
import type { DiffComparison, DiffPage } from "./types.js";
import { pageStatus } from "./viewer-utils.js";
import { reportForComparison } from "./export.js";

/**
 * Per-page status answers "did this page change". A reviewer opens the tool
 * asking a document-level question — how much changed, and how much of it is
 * real. The exported report already totals exactly that, so the summary bar
 * and a downloaded report can never disagree.
 */

export type ComparisonSummary = ReportTotals;

/** A page that changed only through reflow or formatting is noise, not an edit. */
export function isNoisePage(page: DiffPage): boolean {
  return pageStatus(page) === "changed" && page.noticeable === false;
}

export function summarizeComparison(comparison: DiffComparison): ComparisonSummary {
  return reportForComparison(comparison).totals;
}

export function summaryHeadline(summary: ComparisonSummary): string {
  if (summary.changedPages + summary.addedPages + summary.removedPages === 0) {
    return summary.noisePages > 0 ? "No substantive changes" : "The documents are identical";
  }
  if (summary.pages === 1 && summary.changedPages === 1 && !summary.addedPages && !summary.removedPages) return "1 page changed";
  const parts = [`${summary.changedPages} changed`];
  if (summary.addedPages) parts.push(`${summary.addedPages} added`);
  if (summary.removedPages) parts.push(`${summary.removedPages} removed`);
  if (summary.movedPages) parts.push(`${summary.movedPages} moved`);
  return `${parts.join(" · ")} of ${summary.pages} pages`;
}

export function noiseCount(summary: ComparisonSummary): number {
  return summary.classes.reflow + summary.classes.formatting;
}
