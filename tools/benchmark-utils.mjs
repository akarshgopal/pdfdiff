export function integerOption(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback;
}

export function now() {
  return globalThis.performance?.now() ?? Date.now();
}

export function percentile(values, amount) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * amount) - 1)] ?? 0;
}

export function metricSummary(runs) {
  const names = new Set(runs.flatMap((run) => run.metrics.map((metric) => metric.name)));
  return [...names].sort().map((name) => {
    const values = runs.flatMap((run) =>
      run.metrics.filter((metric) => metric.name === name).map((metric) => metric.durationMs),
    );
    return {
      name,
      count: values.length,
      medianMs: percentile(values, 0.5),
      p95Ms: percentile(values, 0.95),
      maxMs: Math.max(...values),
    };
  });
}
