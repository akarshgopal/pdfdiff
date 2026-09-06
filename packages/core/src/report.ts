import type { AlignedPagePair, PageAlignmentKind } from "./document-alignment.js";
import type { ChangeClass, ChangeClassCounts } from "./classification.js";
import type { SemanticChangeKind } from "./semantic.js";
import type { ComparisonPage, PageStatus } from "./types.js";

/**
 * A comparison nobody can export is a comparison nobody can act on. This is the
 * durable form of a result: plain data that survives the browser tab, diffs
 * cleanly in version control, and gives a CI job something to fail on.
 */

export const REPORT_VERSION = 1;

export interface ReportTextChange {
  readonly id: string;
  readonly kind: SemanticChangeKind;
  readonly before: string;
  readonly after: string;
}

export interface ReportPage {
  readonly index: number;
  readonly earlierPage?: number;
  readonly newerPage?: number;
  readonly alignment: PageAlignmentKind;
  readonly status: PageStatus;
  readonly similarity?: number;
  readonly changedPercent?: number;
  readonly noticeable: boolean;
  readonly classes: ChangeClassCounts;
  readonly textChanges: readonly ReportTextChange[];
  readonly hasText: boolean;
  /** True when the page's fonts carried no Unicode mapping, so no text diff is possible. */
  readonly textUnreadable: boolean;
}

export interface ReportTotals {
  readonly pages: number;
  readonly changedPages: number;
  readonly addedPages: number;
  readonly removedPages: number;
  readonly movedPages: number;
  readonly noisePages: number;
  readonly textChanges: number;
  readonly classes: ChangeClassCounts;
  readonly pagesWithoutText: number;
  readonly pagesWithUnreadableText: number;
}

export interface ComparisonReport {
  readonly version: number;
  readonly earlierName: string;
  readonly newerName: string;
  readonly generatedAt: string;
  readonly totals: ReportTotals;
  readonly pages: readonly ReportPage[];
}

export interface BuildReportInput {
  readonly earlierName: string;
  readonly newerName: string;
  readonly pages: readonly ComparisonPage[];
  readonly alignment?: readonly AlignedPagePair[];
  readonly generatedAt?: Date;
}

const EMPTY_CLASSES: ChangeClassCounts = { content: 0, reflow: 0, formatting: 0, graphic: 0 };

function pageClasses(page: ComparisonPage): ChangeClassCounts {
  return page.changeClasses ?? EMPTY_CLASSES;
}

function reportPage(page: ComparisonPage): ReportPage {
  return {
    index: page.index,
    earlierPage: page.earlierPageNumber,
    newerPage: page.newerPageNumber,
    alignment: page.alignment ?? "matched",
    status: page.status ?? "processing",
    similarity: page.similarity,
    changedPercent: page.changedPercent,
    noticeable: page.noticeable ?? true,
    classes: pageClasses(page),
    hasText: Boolean(page.semantic && (page.semantic.hasBeforeText || page.semantic.hasAfterText)),
    textUnreadable: page.semantic?.textUndecodable === true,
    textChanges: (page.semantic?.changes ?? []).map((change) => ({
      id: change.id,
      kind: change.kind,
      before: change.before,
      after: change.after,
    })),
  };
}

function totalsFor(pages: readonly ReportPage[]): ReportTotals {
  let changedPages = 0,
    addedPages = 0,
    removedPages = 0,
    movedPages = 0,
    noisePages = 0,
    textChanges = 0,
    pagesWithoutText = 0,
    pagesWithUnreadableText = 0;
  let classes = EMPTY_CLASSES;
  for (const page of pages) {
    if (page.alignment === "moved") movedPages += 1;
    if (page.status === "added") addedPages += 1;
    else if (page.status === "removed") removedPages += 1;
    else if (page.status === "changed") {
      changedPages += 1;
      if (!page.noticeable) noisePages += 1;
    }
    textChanges += page.textChanges.length;
    if (!page.hasText) pagesWithoutText += 1;
    if (page.textUnreadable) pagesWithUnreadableText += 1;
    classes = {
      content: classes.content + page.classes.content,
      reflow: classes.reflow + page.classes.reflow,
      formatting: classes.formatting + page.classes.formatting,
      graphic: classes.graphic + page.classes.graphic,
    };
  }
  return {
    pages: pages.length,
    changedPages,
    addedPages,
    removedPages,
    movedPages,
    noisePages,
    textChanges,
    classes,
    pagesWithoutText,
    pagesWithUnreadableText,
  };
}

export function buildReport(input: BuildReportInput): ComparisonReport {
  const pages = input.pages.map(reportPage);
  return {
    version: REPORT_VERSION,
    earlierName: input.earlierName,
    newerName: input.newerName,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    totals: totalsFor(pages),
    pages,
  };
}

/** True when any page's text could not be decoded, so a clean result is not trustworthy. */
export function hasUnreadableText(report: ComparisonReport): boolean {
  return report.totals.pagesWithUnreadableText > 0;
}

/** True when the report contains a detected change, including page movement. */
export function hasSubstantiveChanges(report: ComparisonReport): boolean {
  const { changedPages, addedPages, removedPages, movedPages } = report.totals;
  return changedPages + addedPages + removedPages + movedPages > 0;
}

function csvField(value: string | number | undefined): string {
  if (value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADER = ["earlier_page", "newer_page", "alignment", "status", "change_kind", "before", "after"];

/** One row per text change, plus a row for any page that changed without one. */
export function reportToCsv(report: ComparisonReport): string {
  const rows = [CSV_HEADER.join(",")];
  for (const page of report.pages) {
    if (page.textChanges.length === 0) {
      if (page.status === "same" && page.alignment !== "moved") continue;
      rows.push(
        [page.earlierPage, page.newerPage, page.alignment, page.status, "visual", "", ""].map(csvField).join(","),
      );
      continue;
    }
    for (const change of page.textChanges) {
      rows.push(
        [page.earlierPage, page.newerPage, page.alignment, page.status, change.kind, change.before, change.after]
          .map(csvField)
          .join(","),
      );
    }
  }
  return `${rows.join("\n")}\n`;
}

export function reportToJson(report: ComparisonReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function pageLabel(page: ReportPage): string {
  if (page.earlierPage !== undefined && page.newerPage !== undefined) {
    return page.earlierPage === page.newerPage
      ? `Page ${page.newerPage}`
      : `A ${page.earlierPage} → B ${page.newerPage}`;
  }
  return page.earlierPage !== undefined ? `A ${page.earlierPage} (removed)` : `B ${page.newerPage} (added)`;
}

function changeLine(change: ReportTextChange): string {
  if (change.kind === "added") return `  + ${change.after}`;
  if (change.kind === "removed") return `  - ${change.before}`;
  return `  ~ ${change.before} → ${change.after}`;
}

const CLASS_ORDER: readonly ChangeClass[] = ["content", "graphic", "reflow", "formatting"];

/** Human-readable summary for a terminal or a redline appendix. */
export function reportToText(report: ComparisonReport, _options: { readonly includeNoise?: boolean } = {}): string {
  void _options; // Legacy includeNoise callers now receive every detected change.
  const { totals } = report;
  const lines = [
    `${report.earlierName} → ${report.newerName}`,
    `${totals.changedPages} changed · ${totals.addedPages} added · ${totals.removedPages} removed · ${totals.movedPages} moved of ${totals.pages} pages`,
    `${totals.textChanges} text changes · ${CLASS_ORDER.map((name) => `${totals.classes[name]} ${name}`).join(" · ")}`,
  ];
  if (totals.noisePages) lines.push(`${totals.noisePages} pages may include reflow or formatting`);
  if (totals.pagesWithUnreadableText)
    lines.push(
      `WARNING: ${totals.pagesWithUnreadableText} pages embed fonts with no Unicode mapping. Their text extracts as glyph codes, so no text change on those pages can be detected.`,
    );
  else if (totals.pagesWithoutText)
    lines.push(`${totals.pagesWithoutText} pages have no selectable text; those compared visually only`);
  lines.push("");

  for (const page of report.pages) {
    if (page.status === "same" && page.alignment !== "moved") continue;
    lines.push(pageLabel(page));
    for (const change of page.textChanges) lines.push(changeLine(change));
    if (page.textChanges.length === 0) lines.push("  (visual change only)");
  }
  return `${lines.join("\n")}\n`;
}
