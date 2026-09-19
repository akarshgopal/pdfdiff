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

function memoryUsedBytes(): number | undefined {
  const value = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
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

function finish(
  sink: DiffMetricSink,
  name: string,
  startedAt: number,
  status: DiffMetricStatus,
  attributes?: Readonly<Record<string, DiffMetricValue>>,
): void {
  emitMetric(sink, { name, durationMs: Math.max(0, performance.now() - startedAt), status, attributes });
}

export function measure<T>(
  sink: DiffMetricSink | undefined,
  name: string,
  operation: () => T,
  attributes?: Readonly<Record<string, DiffMetricValue>>,
): T {
  if (!sink) return operation();
  const startedAt = performance.now();
  try {
    const result = operation();
    finish(sink, name, startedAt, "ok", attributes);
    return result;
  } catch (error) {
    finish(sink, name, startedAt, "error", attributes);
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
  const startedAt = performance.now();
  try {
    const result = await operation();
    finish(sink, name, startedAt, "ok", attributes);
    return result;
  } catch (error) {
    finish(sink, name, startedAt, "error", attributes);
    throw error;
  }
}
