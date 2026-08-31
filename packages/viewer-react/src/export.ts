import { buildReport, reportToCsv, reportToJson, reportToText, type ComparisonReport, type ComparisonPage } from "@pdfdiff/core";
import type { DiffComparison, DiffPage } from "./types.js";
import { pageStatus } from "./viewer-utils.js";

/**
 * The viewer holds the only copy of a finished comparison. Rebuilding the core
 * report shape from it means a download and a CLI run produce the same
 * document, so a result can leave the tab it was computed in.
 */

export type ExportFormat = "json" | "csv" | "text";

function asComparisonPage(page: DiffPage): ComparisonPage {
  return {
    index: page.index,
    earlierPageNumber: page.earlierPageNumber,
    newerPageNumber: page.newerPageNumber,
    alignment: page.alignment,
    similarity: page.similarity,
    status: pageStatus(page),
    changedPercent: page.changedPercent,
    changeClasses: page.changeClasses,
    noticeable: page.noticeable,
    semantic: page.semantic,
  };
}

export function reportForComparison(comparison: DiffComparison): ComparisonReport {
  return buildReport({
    earlierName: comparison.earlierName,
    newerName: comparison.newerName,
    pages: comparison.pages.map(asComparisonPage),
  });
}

const EXTENSIONS: Record<ExportFormat, string> = { json: "json", csv: "csv", text: "txt" };
const MIME_TYPES: Record<ExportFormat, string> = { json: "application/json", csv: "text/csv", text: "text/plain" };

export function serializeReport(report: ComparisonReport, format: ExportFormat): string {
  if (format === "json") return reportToJson(report);
  return format === "csv" ? reportToCsv(report) : reportToText(report);
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "-").slice(0, 40);
}

export function reportFileName(report: ComparisonReport, format: ExportFormat): string {
  return `${baseName(report.earlierName)}-vs-${baseName(report.newerName)}.${EXTENSIONS[format]}`;
}

/** Hand the serialized report to the browser as a download. */
export function downloadReport(comparison: DiffComparison, format: ExportFormat): void {
  const report = reportForComparison(comparison);
  const blob = new Blob([serializeReport(report, format)], { type: `${MIME_TYPES[format]};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(report, format);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
