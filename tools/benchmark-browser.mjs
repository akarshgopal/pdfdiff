import { access, mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { isAbsolute, resolve } from "node:path";

const DEFAULT_RUNS = 3;
const DEFAULT_WARMUPS = 1;
const DEFAULT_URL = "http://localhost:3000/";
const DEFAULT_EARLIER = "examples/pdf-fixtures/contracts/work-order-original.pdf";
const DEFAULT_NEWER = "examples/pdf-fixtures/contracts/work-order-amended.pdf";
const DEFAULT_OUTPUT = "benchmarks/runs/browser.json";

function integerOption(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback;
}

function now() {
  return globalThis.performance?.now() ?? Date.now();
}

function percentile(values, amount) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * amount) - 1)] ?? 0;
}

function metricSummary(runs) {
  const names = new Set(runs.flatMap((run) => run.metrics.map((metric) => metric.name)));
  return [...names].sort().map((name) => {
    const values = runs.flatMap((run) => run.metrics.filter((metric) => metric.name === name).map((metric) => metric.durationMs));
    return {
      name,
      count: values.length,
      medianMs: percentile(values, 0.5),
      p95Ms: percentile(values, 0.95),
      maxMs: Math.max(...values),
    };
  });
}

function absolutePath(value) {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

async function loadPlaywright() {
  const moduleName = process.env.PDFDIFF_PLAYWRIGHT_MODULE ?? "playwright";
  try {
    return await import(moduleName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error("Unable to load Playwright from " + moduleName + ". Install it with pnpm or set PDFDIFF_PLAYWRIGHT_MODULE. " + message);
  }
}

async function runOnce(page, url, earlierPath, newerPath) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator('input[aria-label^="Choose one or two PDFs for earlier"]').setInputFiles(earlierPath);
  await page.locator('input[aria-label^="Choose one or two PDFs for newer"]').setInputFiles(newerPath);

  const startedAt = now();
  await page.getByRole("button", { name: "Compare PDFs", exact: true }).click();
  await page.locator('section[aria-label="PDF comparison workspace"]').waitFor({ state: "visible" });
  await page.locator('section[aria-label="PDF comparison workspace"] img').first().waitFor({ state: "visible" });

  const browserState = await page.evaluate(() => ({
    metrics: globalThis.__PDFDIFF_METRICS__?.slice() ?? [],
    longTasks: globalThis.__PDFDIFF_LONG_TASKS__?.slice() ?? [],
    pageCount: document.querySelectorAll('aside[aria-label="Pages"] button').length,
  }));
  const comparisonMetric = browserState.metrics.find((metric) => metric.name === "comparison.total");
  return {
    durationMs: Math.max(0, now() - startedAt),
    quality: {
      workspaceReady: true,
      pageCount: browserState.pageCount,
      metricCount: browserState.metrics.length,
      metricsOk: comparisonMetric?.status === "ok" && browserState.metrics.every((metric) => metric.status === "ok"),
      longTaskCount: browserState.longTasks.length,
    },
    metrics: browserState.metrics,
    longTasks: browserState.longTasks,
  };
}

const { values } = parseArgs({ options: {
  runs: { type: "string" },
  warmups: { type: "string" },
  url: { type: "string", default: DEFAULT_URL },
  earlier: { type: "string", default: DEFAULT_EARLIER },
  newer: { type: "string", default: DEFAULT_NEWER },
  output: { type: "string", default: DEFAULT_OUTPUT },
} });
const runs = integerOption(values.runs, DEFAULT_RUNS);
const warmups = integerOption(values.warmups, DEFAULT_WARMUPS, 0);
const { url, earlier, newer, output } = values;
const earlierPath = absolutePath(earlier);
const newerPath = absolutePath(newer);
const { chromium } = await loadPlaywright();
await Promise.all([access(earlierPath), access(newerPath)]);

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PDFDIFF_CHROMIUM_PATH,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext();
await context.addInitScript(() => {
  globalThis.__PDFDIFF_METRICS__ = [];
  globalThis.__PDFDIFF_LONG_TASKS__ = [];
  if (typeof PerformanceObserver !== "function") return;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        globalThis.__PDFDIFF_LONG_TASKS__.push({
          name: entry.name,
          durationMs: entry.duration,
          startTimeMs: entry.startTime,
        });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // Long-task entries are optional browser diagnostics.
  }
});
const page = await context.newPage();
const browserVersion = browser.version();
const browserUserAgent = await page.evaluate(() => navigator.userAgent);
const results = [];

try {
  for (let index = 0; index < warmups; index += 1) await runOnce(page, url, earlierPath, newerPath);
  for (let index = 0; index < runs; index += 1) {
    const result = await runOnce(page, url, earlierPath, newerPath);
    results.push({ index: index + 1, ...result });
  }
} finally {
  await browser.close();
}

const report = {
  schemaVersion: 1,
  benchmark: "browser",
  generatedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    playwrightModule: process.env.PDFDIFF_PLAYWRIGHT_MODULE ?? "playwright",
    chromiumPath: process.env.PDFDIFF_CHROMIUM_PATH ?? "playwright-managed",
    browserVersion,
    browserUserAgent,
  },
  url,
  earlier,
  newer,
  runs,
  warmups,
  scenarios: [{
    id: "pdfjs-fixture-pair",
    description: "PDF.js loading, rendering, comparison, encoding, and viewer readiness for one fixture pair.",
    qualityPassed: results.every((run) => run.quality.workspaceReady && run.quality.pageCount > 0 && run.quality.metricsOk),
    runs: results,
    metricSummary: metricSummary(results),
  }],
};

const outputSeparator = output.lastIndexOf("/");
await mkdir(outputSeparator >= 0 ? output.slice(0, outputSeparator) : ".", { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
console.table([{
  scenario: "pdfjs-fixture-pair",
  quality: report.scenarios[0].qualityPassed ? "pass" : "FAIL",
  medianMs: percentile(results.map((run) => run.durationMs), 0.5).toFixed(2),
  p95Ms: percentile(results.map((run) => run.durationMs), 0.95).toFixed(2),
  longTasks: results.reduce((total, run) => total + run.longTasks.length, 0),
}]);
console.log("Wrote " + output);

if (!report.scenarios[0].qualityPassed) process.exitCode = 1;
