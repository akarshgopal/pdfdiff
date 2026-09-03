import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { percentile } from "./benchmark-utils.mjs";

function requiredOption(value, name) {
  if (!value) throw new Error(`Missing --${name}=...`);
  return value;
}

function numberOption(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function scenarioMap(report) {
  return new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
}

function medianDuration(scenario) {
  return percentile(scenario.runs.map((run) => run.durationMs), 0.5);
}

function relativeChange(baselineMs, currentMs) {
  if (baselineMs <= 0) return currentMs > 0 ? Number.POSITIVE_INFINITY : 0;
  return ((currentMs - baselineMs) / baselineMs) * 100;
}

function compareScenario(baseline, current, thresholdPercent) {
  const regressions = [];
  const baselineDuration = medianDuration(baseline);
  const currentDuration = medianDuration(current);
  const durationChange = relativeChange(baselineDuration, currentDuration);
  if (durationChange > thresholdPercent) {
    regressions.push({
      scenario: current.id,
      metric: "benchmark.scenario",
      baselineMs: baselineDuration,
      currentMs: currentDuration,
      changePercent: durationChange,
    });
  }

  const baselineMetrics = new Map(baseline.metricSummary.map((metric) => [metric.name, metric]));
  for (const metric of current.metricSummary) {
    const previous = baselineMetrics.get(metric.name);
    if (!previous) continue;
    const change = relativeChange(previous.medianMs, metric.medianMs);
    if (change > thresholdPercent) {
      regressions.push({
        scenario: current.id,
        metric: metric.name,
        baselineMs: previous.medianMs,
        currentMs: metric.medianMs,
        changePercent: change,
      });
    }
  }
  return regressions;
}

const { values } = parseArgs({ options: {
  baseline: { type: "string" },
  current: { type: "string" },
  output: { type: "string" },
  threshold: { type: "string" },
  "fail-on-regression": { type: "boolean", default: false },
} });
const baselinePath = requiredOption(values.baseline, "baseline");
const currentPath = requiredOption(values.current, "current");
const outputPath = values.output;
const thresholdPercent = numberOption(values.threshold, 20);
const failOnRegression = values["fail-on-regression"];
const [baseline, current] = await Promise.all([
  readFile(baselinePath, "utf8").then(JSON.parse),
  readFile(currentPath, "utf8").then(JSON.parse),
]);

if (baseline.schemaVersion !== current.schemaVersion) throw new Error("Benchmark schema versions do not match.");
if (baseline.benchmark !== current.benchmark) throw new Error("Benchmark types do not match.");

const baselineScenarios = scenarioMap(baseline);
const currentScenarios = scenarioMap(current);
const regressions = [];
const missing = [];
for (const scenario of current.scenarios) {
  const previous = baselineScenarios.get(scenario.id);
  if (!previous) {
    missing.push(scenario.id);
    continue;
  }
  regressions.push(...compareScenario(previous, scenario, thresholdPercent));
}
for (const scenario of baseline.scenarios) {
  if (!currentScenarios.has(scenario.id)) missing.push(`${scenario.id} (missing from current run)`);
}

const qualityFailures = current.scenarios.filter((scenario) => !scenario.qualityPassed).map((scenario) => scenario.id);
const report = {
  schemaVersion: current.schemaVersion,
  benchmark: current.benchmark,
  comparedAt: new Date().toISOString(),
  baselinePath,
  currentPath,
  thresholdPercent,
  regressions,
  missing,
  qualityFailures,
  passed: regressions.length === 0 && missing.length === 0 && qualityFailures.length === 0,
};

console.table(regressions.map((entry) => ({
  scenario: entry.scenario,
  metric: entry.metric,
  baselineMs: entry.baselineMs.toFixed(2),
  currentMs: entry.currentMs.toFixed(2),
  change: `${entry.changePercent.toFixed(1)}%`,
})));
console.log(report.passed ? "Benchmark comparison passed." : "Benchmark comparison found issues.");

if (outputPath) {
  const outputSeparator = outputPath.lastIndexOf("/");
  await mkdir(outputSeparator >= 0 ? outputPath.slice(0, outputSeparator) : ".", { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
if (failOnRegression && !report.passed) process.exitCode = 1;
