#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  hasSubstantiveChanges,
  hasUnreadableText,
  reportToCsv,
  reportToJson,
  reportToText,
  type ComparisonReport,
} from "@pdfdiff/core";
import { comparePdfText } from "./compare.js";

const FORMATS = ["text", "json", "csv"] as const;
type ReportFormat = (typeof FORMATS)[number];

const USAGE = `pdfdiff — compare two PDFs by content

Usage:
  pdfdiff <earlier.pdf> <newer.pdf> [options]

Options:
  --report <text|json|csv>  Output format (default: text)
  --out <path>              Write the report to a file instead of stdout
  --fail-on-change          Exit 1 when a substantive change is found
  --fail-on-unreadable      Exit 1 when any page's text could not be decoded
  --include-noise           Keep pages that changed only by reflow or formatting
  --no-detect-moves         Report moved pages as a removal plus an addition
  --threshold <0..1>        Page match threshold for alignment (default: 0.55)
  -h, --help                Show this message

Compares extracted text and page structure. Visual and graphic differences
need the browser app; this path is for scripted and CI use.
`;

class UsageError extends Error {}

function readFormat(value: string): ReportFormat {
  if ((FORMATS as readonly string[]).includes(value)) return value as ReportFormat;
  throw new UsageError(`--report must be one of ${FORMATS.join(", ")}`);
}

function readThreshold(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new UsageError("--threshold must be between 0 and 1");
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
        "fail-on-change": { type: "boolean", default: false },
        "fail-on-unreadable": { type: "boolean", default: false },
        "include-noise": { type: "boolean", default: false },
        // parseArgs has no --no-<flag> negation, so the documented spelling is the option.
        "no-detect-moves": { type: "boolean", default: false },
        threshold: { type: "string" },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 2) throw new UsageError("Provide exactly two PDF paths.");
  return {
    earlier: positionals[0]!,
    newer: positionals[1]!,
    format: readFormat(values.report!),
    out: values.out,
    failOnChange: values["fail-on-change"]!,
    failOnUnreadable: values["fail-on-unreadable"]!,
    includeNoise: values["include-noise"]!,
    detectMoves: !values["no-detect-moves"],
    threshold: readThreshold(values.threshold),
  };
}

type CliOptions = ReturnType<typeof parseArguments>;

function render(report: ComparisonReport, options: CliOptions): string {
  if (options.format === "json") return reportToJson(report);
  if (options.format === "csv") return reportToCsv(report);
  return reportToText(report, { includeNoise: options.includeNoise });
}

async function main(argv: readonly string[]): Promise<number> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }
  const options = parseArguments(argv);
  const { report } = await comparePdfText(options.earlier, options.newer, {
    matchThreshold: options.threshold,
    detectMoves: options.detectMoves,
  });
  const output = render(report, options);
  if (options.out) await writeFile(options.out, output);
  else process.stdout.write(output);

  const unreadable = hasUnreadableText(report);
  if (unreadable) {
    // A clean result over text we could not read is the one failure a pipeline must never trust.
    process.stderr.write(
      `warning: ${report.totals.pagesWithUnreadableText} of ${report.totals.pages} pages embed fonts with no Unicode mapping; text changes on those pages cannot be detected.\n`,
    );
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
