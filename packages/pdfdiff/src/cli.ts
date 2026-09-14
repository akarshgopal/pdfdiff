#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  DEFAULT_SENSITIVITY,
  hasSubstantiveChanges,
  hasUnreadableText,
  reportToCsv,
  reportToJson,
  reportToMarkdown,
  reportToText,
  type ComparisonReport,
} from "@pdfdiff/core";
import { comparePdfs, type OverlayEvent } from "./compare.js";
import { rasterToPng } from "./png.js";

const FORMATS = ["text", "json", "csv", "markdown"] as const;
type ReportFormat = (typeof FORMATS)[number];

const USAGE = `pdfdiff — compare two PDFs by content and appearance

Usage:
  pdfdiff <earlier.pdf> <newer.pdf> [options]

Options:
  --report <text|json|csv|markdown>  Output format (default: text)
  --out <path>                       Write the report to a file instead of stdout
  --images <dir>                     Write overlay PNGs for changed pages
  --text-only                        Skip pixel comparison (text and structure only)
  --fail-on-change                   Exit 1 when a substantive change is found
  --fail-on-unreadable               Exit 1 when any page's text could not be decoded
  --no-detect-moves                  Report moved pages as a removal plus an addition
  --no-align                         Do not shift pages to cancel a small translation
  --threshold <0..1>                 Page match threshold for alignment (default: 0.55)
  --sensitivity <0..100>             Pixel-diff sensitivity (default: ${DEFAULT_SENSITIVITY})
  --quiet                            Suppress progress and warnings
  -V, --version                      Print the package version
  -h, --help                         Show this message

Exit codes:
  0  Success (or no changes, when --fail-on-change is set)
  1  Changes found (--fail-on-change) or unreadable text (--fail-on-unreadable)
  2  Usage error
  3  Runtime error

Compares extracted text, page structure, and (unless --text-only) a raster overlay.
Drawings whose fonts have no Unicode map still show visual changes; their text
cannot be diffed. Pixel output is close to the browser app, not identical.
`;

class UsageError extends Error {}

function readFormat(value: string): ReportFormat {
  if ((FORMATS as readonly string[]).includes(value)) return value as ReportFormat;
  throw new UsageError(`--report must be one of ${FORMATS.join(", ")}`);
}

function readNumber(value: string | undefined, flag: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new UsageError(`${flag} must be between ${min} and ${max}`);
  }
  return parsed;
}

function parseArguments(argv: readonly string[]) {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        report: { type: "string", default: "text" },
        out: { type: "string" },
        images: { type: "string" },
        "text-only": { type: "boolean", default: false },
        "fail-on-change": { type: "boolean", default: false },
        "fail-on-unreadable": { type: "boolean", default: false },
        "no-detect-moves": { type: "boolean", default: false },
        "no-align": { type: "boolean", default: false },
        threshold: { type: "string" },
        sensitivity: { type: "string" },
        quiet: { type: "boolean", default: false },
        version: { type: "boolean", short: "V", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.help) return { help: true as const };
  if (values.version) return { version: true as const };
  if (positionals.length !== 2) throw new UsageError("Provide exactly two PDF paths.");
  return {
    earlier: positionals[0]!,
    newer: positionals[1]!,
    format: readFormat(values.report!),
    out: values.out,
    images: values.images,
    textOnly: values["text-only"]!,
    failOnChange: values["fail-on-change"]!,
    failOnUnreadable: values["fail-on-unreadable"]!,
    detectMoves: !values["no-detect-moves"],
    alignByTranslation: !values["no-align"],
    threshold: readNumber(values.threshold, "--threshold", 0, 1),
    sensitivity: readNumber(values.sensitivity, "--sensitivity", 0, 100),
    quiet: values.quiet!,
  };
}

function render(report: ComparisonReport, format: ReportFormat): string {
  if (format === "json") return reportToJson(report);
  if (format === "csv") return reportToCsv(report);
  if (format === "markdown") return reportToMarkdown(report);
  return reportToText(report);
}

function overlayFileName(event: OverlayEvent): string {
  const earlier = event.earlierPage ?? "x";
  const newer = event.newerPage ?? "x";
  return `a${earlier}-b${newer}.png`;
}

async function packageVersion(): Promise<string> {
  const url = new URL("../package.json", import.meta.url);
  const manifest = JSON.parse(await readFile(url, "utf8")) as { version: string };
  return manifest.version;
}

async function main(argv: readonly string[]): Promise<number> {
  if (argv.length === 0) {
    process.stdout.write(USAGE);
    return 0;
  }
  const options = parseArguments(argv);
  if ("help" in options) {
    process.stdout.write(USAGE);
    return 0;
  }
  if ("version" in options) {
    process.stdout.write(`${await packageVersion()}\n`);
    return 0;
  }

  if (options.images && options.textOnly) {
    throw new UsageError("--images requires a visual comparison; omit --text-only.");
  }
  if (options.images) await mkdir(options.images, { recursive: true });

  const { report } = await comparePdfs(options.earlier, options.newer, {
    matchThreshold: options.threshold,
    detectMoves: options.detectMoves,
    visual: !options.textOnly,
    sensitivity: options.sensitivity,
    alignByTranslation: options.alignByTranslation,
    onProgress:
      options.quiet || options.textOnly
        ? undefined
        : ({ completed, total }) => {
            process.stderr.write(`\rComparing page ${completed}/${total}`);
            if (completed === total) process.stderr.write("\n");
          },
    onOverlay: options.images
      ? async (event) => {
          await writeFile(join(options.images!, overlayFileName(event)), await rasterToPng(event.overlay));
        }
      : undefined,
  });

  const output = render(report, options.format);
  if (options.out) await writeFile(options.out, output);
  else process.stdout.write(output);

  const unreadable = hasUnreadableText(report);
  if (unreadable && !options.quiet) {
    process.stderr.write(
      `warning: ${report.totals.pagesWithUnreadableText} of ${report.totals.pages} pages embed fonts with no Unicode mapping; text changes on those pages cannot be detected.\n`,
    );
  }
  if (options.images && !options.quiet) {
    process.stderr.write(`wrote overlay PNGs to ${options.images}\n`);
  }
  if (options.failOnUnreadable && unreadable) return 1;
  return options.failOnChange && hasSubstantiveChanges(report) ? 1 : 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const usage = error instanceof UsageError;
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  if (usage) process.stderr.write(`\n${USAGE}`);
  process.exitCode = usage ? 2 : 3;
}
