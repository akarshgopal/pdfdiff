export type DiffMetricValue = string | number | boolean | null;

export type DiffMetricStatus = "ok" | "error";

export interface DiffMetric {
  readonly name: string;
  readonly durationMs: number;
  readonly status: DiffMetricStatus;
  readonly attributes?: Readonly<Record<string, DiffMetricValue>>;
  /** Available in Chromium-based browsers when the non-standard API exists. */
  readonly memoryUsedBytes?: number;
}

export type DiffMetricSink = (metric: DiffMetric) => void;

interface RuntimePerformance {
  now(): number;
  memory?: { usedJSHeapSize: number };
}

function runtimePerformance(): RuntimePerformance | undefined {
  const runtime = globalThis as typeof globalThis & { performance?: RuntimePerformance };
  return runtime.performance;
}

function now(): number {
  return runtimePerformance()?.now() ?? Date.now();
}

function memoryUsedBytes(): number | undefined {
  const value = runtimePerformance()?.memory?.usedJSHeapSize;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function emitMetric(sink: DiffMetricSink | undefined, metric: DiffMetric): void {
  if (!sink) return;
  try {
    sink({ ...metric, memoryUsedBytes: metric.memoryUsedBytes ?? memoryUsedBytes() });
  } catch {
    // Diagnostics must never change comparison behavior.
  }
}

export function measure<T>(
  sink: DiffMetricSink | undefined,
  name: string,
  operation: () => T,
  attributes?: Readonly<Record<string, DiffMetricValue>>,
): T {
  if (!sink) return operation();
  const startedAt = now();
  try {
    const result = operation();
    emitMetric(sink, { name, durationMs: Math.max(0, now() - startedAt), status: "ok", attributes });
    return result;
  } catch (error) {
    emitMetric(sink, { name, durationMs: Math.max(0, now() - startedAt), status: "error", attributes });
    throw error;
  }
}

export async function measureAsync<T>(
  sink: DiffMetricSink | undefined,
  name: string,
  operation: () => Promise<T>,
  attributes?: Readonly<Record<string, DiffMetricValue>>,
): Promise<T> {
  if (!sink) return operation();
  const startedAt = now();
  try {
    const result = await operation();
    emitMetric(sink, { name, durationMs: Math.max(0, now() - startedAt), status: "ok", attributes });
    return result;
  } catch (error) {
    emitMetric(sink, { name, durationMs: Math.max(0, now() - startedAt), status: "error", attributes });
    throw error;
  }
}
