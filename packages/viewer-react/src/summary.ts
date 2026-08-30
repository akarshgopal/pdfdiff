import type { ChangeClass, ChangeClassCounts, DiffComparison, DiffPage } from "./types.js";
import { pageStatus } from "./viewer-utils.js";

/**
 * Per-page status answers "did this page change". A reviewer opens the tool
 * asking a document-level question — how much changed, and how much of it is
 * real — so the summary is computed once over every page.
 */

export interface ComparisonSummary {
  readonly totalPages: number;
  readonly changedPages: number;
  readonly addedPages: number;
  readonly removedPages: number;
  readonly movedPages: number;
  readonly noisePages: number;
  readonly textChanges: number;
  readonly classes: ChangeClassCounts;
  readonly pagesWithoutText: number;
  /** Pages that carried text the embedded fonts could not decode into words. */
  readonly pagesWithUnreadableText: number;
}

const EMPTY_CLASSES: ChangeClassCounts = { content: 0, reflow: 0, formatting: 0, graphic: 0 };

function hasNoText(page: DiffPage): boolean {
  return page.semantic ? !page.semantic.hasBeforeText && !page.semantic.hasAfterText : false;
}

function hasUnreadableText(page: DiffPage): boolean {
  return page.semantic?.textUndecodable === true;
}

/** A page that changed only through reflow or formatting is noise, not an edit. */
export function isNoisePage(page: DiffPage): boolean {
  return pageStatus(page) === "changed" && page.noticeable === false;
}

export function summarizeComparison(comparison: DiffComparison): ComparisonSummary {
  let changedPages = 0, addedPages = 0, removedPages = 0, movedPages = 0, noisePages = 0, textChanges = 0, pagesWithoutText = 0, pagesWithUnreadableText = 0;
  let classes = EMPTY_CLASSES;

  for (const page of comparison.pages) {
    const status = pageStatus(page);
    if (page.alignment === "moved") movedPages += 1;
    if (status === "added") addedPages += 1;
    else if (status === "removed") removedPages += 1;
    else if (status === "changed") {
      if (isNoisePage(page)) noisePages += 1;
      else changedPages += 1;
    }
    textChanges += page.textChangeCount ?? 0;
    if (hasNoText(page)) pagesWithoutText += 1;
    if (hasUnreadableText(page)) pagesWithUnreadableText += 1;
    const pageClasses = page.changeClasses;
    if (pageClasses) {
      classes = {
        content: classes.content + pageClasses.content,
        reflow: classes.reflow + pageClasses.reflow,
        formatting: classes.formatting + pageClasses.formatting,
        graphic: classes.graphic + pageClasses.graphic,
      };
    }
  }

  return {
    totalPages: comparison.pages.length,
    changedPages, addedPages, removedPages, movedPages, noisePages, textChanges, classes, pagesWithoutText, pagesWithUnreadableText,
  };
}

export function summaryHeadline(summary: ComparisonSummary): string {
  if (summary.changedPages + summary.addedPages + summary.removedPages === 0) {
    return summary.noisePages > 0 ? "No substantive changes" : "The documents are identical";
  }
  if (summary.totalPages === 1 && summary.changedPages === 1 && !summary.addedPages && !summary.removedPages) return "1 page changed";
  const parts = [`${summary.changedPages} changed`];
  if (summary.addedPages) parts.push(`${summary.addedPages} added`);
  if (summary.removedPages) parts.push(`${summary.removedPages} removed`);
  if (summary.movedPages) parts.push(`${summary.movedPages} moved`);
  return `${parts.join(" · ")} of ${summary.totalPages} pages`;
}

export const noisyClasses: readonly ChangeClass[] = ["reflow", "formatting"];

export function noiseCount(summary: ComparisonSummary): number {
  return summary.classes.reflow + summary.classes.formatting;
}
