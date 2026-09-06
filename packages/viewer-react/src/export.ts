import {
  buildReport,
  reportToCsv,
  reportToJson,
  reportToText,
  type ComparisonReport,
  type ComparisonPage,
} from "@pdfdiff/core";
import type { DiffComparison, DiffPage, OverlayStyle } from "./types.js";
import { pageStatus } from "./viewer-utils.js";

/**
 * The viewer holds the only copy of a finished comparison. Rebuilding the core
 * report shape from it means a download and a CLI run produce the same
 * document, so a result can leave the tab it was computed in.
 */

export type ExportFormat = "json" | "csv" | "text";
/** A report format, or the rendered diff overlay for the page on screen. */
export type ExportChoice = ExportFormat | "page-image";

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
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[^\w.-]+/g, "-")
    .slice(0, 40);
}

export function reportFileName(report: ComparisonReport, format: ExportFormat): string {
  return `${baseName(report.earlierName)}-vs-${baseName(report.newerName)}.${EXTENSIONS[format]}`;
}

function saveUrl(url: string, fileName: string, revoke: boolean): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking in this task can cancel the download the click just started.
  if (revoke) setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Hand the serialized report to the browser as a download. */
export function downloadReport(comparison: DiffComparison, format: ExportFormat): void {
  const report = reportForComparison(comparison);
  const blob = new Blob([serializeReport(report, format)], { type: `${MIME_TYPES[format]};charset=utf-8` });
  saveUrl(URL.createObjectURL(blob), reportFileName(report, format), true);
}

/** The marked-up overlay is the artefact a reviewer actually circulates, so it has to be able to leave the tab. */
export function pageImageFileName(comparison: DiffComparison, page: DiffPage): string {
  const earlier = page.earlierPageNumber;
  const newer = page.newerPageNumber;
  const label =
    earlier !== undefined && newer !== undefined
      ? earlier === newer
        ? `page-${newer}`
        : `page-A${earlier}-B${newer}`
      : earlier !== undefined
        ? `page-A${earlier}`
        : newer !== undefined
          ? `page-B${newer}`
          : `page-${page.index + 1}`;
  return `${baseName(comparison.earlierName)}-vs-${baseName(comparison.newerName)}-${label}.png`;
}

export function canDownloadPageImage(page: DiffPage | null): boolean {
  return Boolean(page?.layers ?? page?.diffSrc);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to read the overlay for export."));
    image.src = src;
  });
}

/** Tint one alpha mask with a flat colour, the canvas equivalent of the CSS mask. */
function tintedMask(mask: HTMLImageElement, color: string, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.drawImage(mask, 0, 0, width, height);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas;
}

/**
 * The exported image has to match what is on screen, so it is composed from the
 * same layers with the same settings rather than reusing a blob whose colours
 * were fixed when the page was compared. It is flattened onto white: the export
 * is a printable artefact, not a screenshot of the current theme.
 */
async function composeOverlay(page: DiffPage, overlay: OverlayStyle): Promise<Blob | null> {
  if (!page.layers) return null;
  const [base, added, removed, modified] = await Promise.all([
    loadImage(page.layers.base),
    loadImage(page.layers.added),
    loadImage(page.layers.removed),
    loadImage(page.layers.modified),
  ]);
  const width = base.naturalWidth;
  const height = base.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.globalAlpha = Math.max(0, Math.min(1, overlay.unchangedOpacity));
  context.drawImage(base, 0, 0, width, height);
  context.globalAlpha = 1;
  context.drawImage(tintedMask(removed, overlay.removedColor, width, height), 0, 0);
  context.drawImage(tintedMask(modified, overlay.modifiedColor, width, height), 0, 0);
  context.drawImage(tintedMask(added, overlay.addedColor, width, height), 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

export async function downloadPageImage(
  comparison: DiffComparison,
  page: DiffPage,
  overlay: OverlayStyle,
): Promise<void> {
  const composed = await composeOverlay(page, overlay);
  const fileName = pageImageFileName(comparison, page);
  if (composed) {
    saveUrl(URL.createObjectURL(composed), fileName, true);
    return;
  }
  // No layers for this page yet; the baked overlay is the best available.
  if (page.diffSrc) saveUrl(page.diffSrc, fileName, false);
}
