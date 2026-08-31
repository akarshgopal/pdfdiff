import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { diffImages, diffSemanticText, alignByTranslation } from "@pdfdiff/core";

const DEFAULT_RUNS = 5;
const DEFAULT_WARMUPS = 1;
const DEFAULT_OUTPUT = "benchmarks/runs/core.json";

function integerOption(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback;
}

function now() {
  return globalThis.performance?.now() ?? Date.now();
}

function raster(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
  drawRect(data, width, 48, 48, 180, 12, [42, 48, 60]);
  drawRect(data, width, 48, 88, 320, 8, [96, 105, 120]);
  drawRect(data, width, 48, 128, 240, 8, [96, 105, 120]);
  drawRect(data, width, 48, 200, 180, 120, [228, 232, 238]);
  drawRect(data, width, 280, 200, 360, 18, [70, 78, 92]);
  drawRect(data, width, 280, 236, 280, 10, [146, 154, 168]);
  return { width, height, data };
}

function drawRect(data, width, x, y, rectWidth, rectHeight, color) {
  for (let row = y; row < y + rectHeight; row += 1) {
    for (let column = x; column < x + rectWidth; column += 1) {
      const offset = (row * width + column) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
    }
  }
}

function changedRaster(source) {
  const newer = {
    width: source.width,
    height: source.height,
    data: source.data.slice(),
  };
  drawRect(newer.data, newer.width, 540, 400, 160, 80, [186, 54, 72]);
  drawRect(newer.data, newer.width, 280, 236, 420, 10, [80, 126, 184]);
  return newer;
}

function shiftedRaster(source, dx, dy) {
  const data = new Uint8ClampedArray(source.data.length);
  data.fill(255);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const targetX = x + dx;
      const targetY = y + dy;
      if (targetX < 0 || targetX >= source.width || targetY < 0 || targetY >= source.height) continue;
      const sourceOffset = (y * source.width + x) * 4;
      const targetOffset = (targetY * source.width + targetX) * 4;
      data.set(source.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return { width: source.width, height: source.height, data };
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

function scenario(id, description, operation, validate) {
  return { id, description, operation, validate };
}

function buildScenarios() {
  const base = raster(1024, 768);
  const changed = changedRaster(base);
  const shifted = shiftedRaster(base, 4, 4);
  const beforeText = Array.from({ length: 900 }, (_, index) => `Section ${index} payment is due within thirty days.`).join(" ");
  const afterText = beforeText.replaceAll("thirty", "forty-five").replace("Section 420", "Revised section 420");

  return [
    scenario(
      "visual-identical",
      "A same-size raster pair with no changes.",
      (metrics) => {
        const result = diffImages(base, base, { threshold: 0.1, metrics });
        return { changedPixels: result.changedPixels, regions: result.regions.length };
      },
      (result) => result.changedPixels === 0 && result.regions === 0,
    ),
    scenario(
      "visual-changes",
      "A same-size pair with several changed regions.",
      (metrics) => {
        const result = diffImages(base, changed, { threshold: 0.1, regionOptions: { minPixels: 4 }, metrics });
        return { changedPixels: result.changedPixels, changedPercent: result.changedPercent, regions: result.regions.length };
      },
      (result) => result.changedPixels > 0 && result.regions > 0,
    ),
    scenario(
      "translation-alignment",
      "A pair with a known four-by-four pixel content translation.",
      (metrics) => {
        const result = alignByTranslation(base, shifted, undefined, metrics);
        return { dx: result.dx, dy: result.dy };
      },
      (result) => result.dx === -4 && result.dy === -4,
    ),
    scenario(
      "semantic-change",
      "A long token stream with repeated and localized text changes.",
      (metrics) => {
        const result = diffSemanticText(beforeText, afterText, { metrics });
        return { beforeTokens: result.beforeTokenCount, afterTokens: result.afterTokenCount, changes: result.changes.length };
      },
      (result) => result.changes > 0,
    ),
  ];
}

async function runScenario(entry, runs, warmups) {
  let metrics = [];
  const sink = (metric) => metrics.push(metric);
  for (let index = 0; index < warmups; index += 1) {
    metrics = [];
    entry.operation(sink);
  }

  const results = [];
  for (let index = 0; index < runs; index += 1) {
    metrics = [];
    const startedAt = now();
    const quality = entry.operation(sink);
    results.push({
      index: index + 1,
      durationMs: Math.max(0, now() - startedAt),
      quality,
      metrics,
    });
  }

  const qualityPassed = results.every((run) => entry.validate(run.quality));
  return {
    id: entry.id,
    description: entry.description,
    qualityPassed,
    runs: results,
    metricSummary: metricSummary(results),
  };
}

const { values } = parseArgs({ options: {
  runs: { type: "string" },
  warmups: { type: "string" },
  output: { type: "string", default: DEFAULT_OUTPUT },
} });
const runs = integerOption(values.runs, DEFAULT_RUNS);
const warmups = integerOption(values.warmups, DEFAULT_WARMUPS, 0);
const output = values.output;
const scenarios = [];

for (const entry of buildScenarios()) {
  scenarios.push(await runScenario(entry, runs, warmups));
}

const report = {
  schemaVersion: 1,
  benchmark: "core",
  generatedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  runs,
  warmups,
  scenarios,
};

const outputSeparator = output.lastIndexOf("/");
await mkdir(outputSeparator >= 0 ? output.slice(0, outputSeparator) : ".", { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.table(scenarios.map((entry) => ({
  scenario: entry.id,
  quality: entry.qualityPassed ? "pass" : "FAIL",
  medianMs: percentile(entry.runs.map((run) => run.durationMs), 0.5).toFixed(2),
  p95Ms: percentile(entry.runs.map((run) => run.durationMs), 0.95).toFixed(2),
})));
console.log(`Wrote ${output}`);

if (scenarios.some((entry) => !entry.qualityPassed)) process.exitCode = 1;
