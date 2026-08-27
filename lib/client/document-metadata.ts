/**
 * Small, deterministic helpers for displaying PDF metadata in the client.
 *
 * These helpers intentionally expose coarse buckets for telemetry. Exact file
 * sizes, names, and page counts should stay in the browser and never be sent
 * to an analytics endpoint.
 */

export type FileSizeBucket =
  | "0-1mb"
  | "1-10mb"
  | "10-50mb"
  | "50-100mb"
  | "100mb+";

export type PageCountBucket = "0" | "1-5" | "6-20" | "21-50" | "51-100" | "101+";

export type DurationBucket = "under-1s" | "1-5s" | "5-15s" | "15-60s" | "60s+";

const KIB = 1024;
const MIB = KIB * KIB;

export interface FormatBytesOptions {
  /** Maximum number of digits after the decimal point. Defaults to one. */
  maximumFractionDigits?: number;
  /** Text used when the input is not a non-negative finite number. */
  invalidLabel?: string;
}

function normalizedNonNegativeInteger(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

/** Format a byte count using binary units (KiB, MiB, GiB). */
export function formatBytes(bytes: number, options: FormatBytesOptions = {}): string {
  if (!Number.isFinite(bytes) || bytes < 0) return options.invalidLabel ?? "—";

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const unitIndex = Math.min(Math.floor(Math.log(bytes || 1) / Math.log(KIB)), units.length - 1);
  const value = bytes / KIB ** unitIndex;
  const maximumFractionDigits = Math.max(
    0,
    Math.min(3, Math.floor(options.maximumFractionDigits ?? (unitIndex === 0 ? 0 : 1))),
  );

  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value)} ${units[unitIndex]}`;
}

/** Return a singular/plural page count label suitable for compact UI. */
export function formatPageCount(pageCount: number, invalidLabel = "—"): string {
  const count = normalizedNonNegativeInteger(pageCount);
  if (count === null) return invalidLabel;
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

/** Return a clamped, one-based page number. Empty documents return zero. */
export function clampPageNumber(pageNumber: number, pageCount: number): number {
  const count = normalizedNonNegativeInteger(pageCount) ?? 0;
  if (count === 0) return 0;
  const page = Number.isFinite(pageNumber) ? Math.floor(pageNumber) : 1;
  return Math.min(count, Math.max(1, page));
}

/** Format a page position such as "Page 2 of 12". */
export function formatPagePosition(pageNumber: number, pageCount: number, invalidLabel = "—"): string {
  const count = normalizedNonNegativeInteger(pageCount);
  if (count === null || count === 0) return invalidLabel;
  return `Page ${clampPageNumber(pageNumber, count)} of ${count}`;
}

/** Format a percentage while keeping output stable across locales. */
export function formatPercent(value: number, maximumFractionDigits = 1, invalidLabel = "—"): string {
  if (!Number.isFinite(value)) return invalidLabel;
  const digits = Math.max(0, Math.min(3, Math.floor(maximumFractionDigits)));
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value)}%`;
}

/** Return a coarse file-size bucket for aggregate, privacy-safe analytics. */
export function bucketFileSize(bytes: number): FileSizeBucket | null {
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < MIB) return "0-1mb";
  if (bytes < 10 * MIB) return "1-10mb";
  if (bytes < 50 * MIB) return "10-50mb";
  if (bytes < 100 * MIB) return "50-100mb";
  return "100mb+";
}

/** Return a coarse page-count bucket for aggregate, privacy-safe analytics. */
export function bucketPageCount(pageCount: number): PageCountBucket | null {
  const count = normalizedNonNegativeInteger(pageCount);
  if (count === null) return null;
  if (count === 0) return "0";
  if (count <= 5) return "1-5";
  if (count <= 20) return "6-20";
  if (count <= 50) return "21-50";
  if (count <= 100) return "51-100";
  return "101+";
}

/** Return a coarse processing-duration bucket for aggregate analytics. */
export function bucketDuration(milliseconds: number): DurationBucket | null {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  if (milliseconds < 1_000) return "under-1s";
  if (milliseconds < 5_000) return "1-5s";
  if (milliseconds < 15_000) return "5-15s";
  if (milliseconds < 60_000) return "15-60s";
  return "60s+";
}

/** Extract a lowercase extension without exposing the rest of the file name. */
export function getFileExtension(fileName: string): string {
  const basename = fileName.split(/[\\/]/u).pop() ?? "";
  const dot = basename.lastIndexOf(".");
  if (dot <= 0 || dot === basename.length - 1) return "";
  return basename.slice(dot + 1).toLowerCase();
}
