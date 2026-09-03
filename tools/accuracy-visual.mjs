import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

const corpus = JSON.parse(await readFile(resolve("benchmarks/accuracy/corpus.json"), "utf8"));
const urlArgument = process.argv.find((value) => value.startsWith("--url="));
const check = process.argv.includes("--check");
const url = urlArgument?.slice("--url=".length) ?? "http://127.0.0.1:4176/";

for (const entry of corpus.cases ?? []) for (const page of entry.visualPages ?? []) {
  if (!Number.isInteger(page.earlier) || !Number.isInteger(page.newer) || !["same", "changed", "added", "removed"].includes(page.status)) throw new Error(`${entry.id} has an invalid visual page expectation.`);
  for (const region of page.regions ?? []) if (!region.label || !Array.isArray(region.box) || region.box.length !== 4
    || region.box.some((value) => !Number.isFinite(value) || value < 0 || value > 1) || region.box[0] >= region.box[2] || region.box[1] >= region.box[3]) throw new Error(`${entry.id} has an invalid normalized visual box.`);
}

const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function startServer() {
  if (urlArgument) return undefined;
  const child = spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4176", "--strictPort"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error("The visual accuracy server stopped before it was ready.");
    try {
      if ((await fetch(url)).ok) return child;
    } catch {
      await delay(100);
    }
  }
  child.kill();
  throw new Error("Timed out starting the visual accuracy server.");
}

function intersectionCoverage(expected, actual) {
  const [left, top, right, bottom] = expected;
  const actualRight = actual.x + actual.width;
  const actualBottom = actual.y + actual.height;
  const width = Math.max(0, Math.min(right, actualRight) - Math.max(left, actual.x));
  const height = Math.max(0, Math.min(bottom, actualBottom) - Math.max(top, actual.y));
  const intersection = width * height;
  const expectedArea = (right - left) * (bottom - top);
  const actualArea = actual.width * actual.height;
  return intersection / Math.max(Number.EPSILON, Math.min(expectedArea, actualArea));
}

function scoreCase(entry, pages) {
  let expectedPages = 0, foundPages = 0, expectedRegions = 0, foundRegions = 0;
  const missing = [];
  for (const expected of entry.visualPages ?? []) {
    expectedPages += 1;
    expectedRegions += expected.regions?.length ?? 0;
    const actual = pages.find((page) => page.earlier === expected.earlier && page.newer === expected.newer);
    if (!actual || actual.status !== expected.status) {
      missing.push(`A${expected.earlier ?? "-"}/B${expected.newer ?? "-"} expected ${expected.status}, got ${actual?.status ?? "no pair"}`);
      continue;
    }
    foundPages += 1;
    for (const region of expected.regions ?? []) {
      if (actual.regions.some((candidate) => intersectionCoverage(region.box, candidate) >= 0.15)) foundRegions += 1;
      else missing.push(region.label);
    }
  }
  return { expectedPages, foundPages, expectedRegions, foundRegions, missing };
}

const server = await startServer();
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
const results = [];

try {
  for (const entry of corpus.cases.filter((candidate) => candidate.visualPages?.length)) {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.__accuracyFiles = [];
      document.addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (file) window.__accuracyFiles.push(file);
      }, true);
    });
    const inputs = page.locator('input[type="file"]');
    await inputs.nth(0).setInputFiles(resolve(entry.earlier));
    await inputs.nth(1).setInputFiles(resolve(entry.newer));
    const pages = await page.evaluate(async () => {
      const [earlier, newer] = window.__accuracyFiles;
      if (!earlier || !newer) throw new Error("Accuracy fixture files were not selected.");
      const { browserPdfDiffEngine } = await import("/app/PdfDiffEngine.ts");
      const comparison = await browserPdfDiffEngine.compare({
        earlier,
        newer,
        options: { sensitivity: 28, alignment: "translation", matchPages: true },
        signal: new AbortController().signal,
      });
      try {
        return comparison.pages.map((page) => ({
          earlier: page.earlierPageNumber,
          newer: page.newerPageNumber,
          status: page.status,
          regions: (page.regions ?? []).map((region) => ({
            x: region.x / 100,
            y: region.y / 100,
            width: region.width / 100,
            height: region.height / 100,
          })),
        }));
      } finally {
        comparison.dispose?.();
      }
    });
    results.push({ entry, ...scoreCase(entry, pages) });
  }
} finally {
  await browser.close();
  server?.kill();
}

console.table(results.map((result) => ({
  case: result.entry.id,
  pages: `${result.foundPages}/${result.expectedPages}`,
  regionAnchors: `${result.foundRegions}/${result.expectedRegions}`,
  result: result.missing.length ? "FAIL" : "pass",
})));
for (const result of results.filter((candidate) => candidate.missing.length)) console.log(`${result.entry.id}: missing ${result.missing.join(", ")}`);
if (check && results.some((result) => result.missing.length)) process.exitCode = 1;
