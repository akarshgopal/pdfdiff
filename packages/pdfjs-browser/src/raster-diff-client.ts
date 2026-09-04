import { PdfDiffAbortError, throwIfAborted, type DiffMetricSink } from "@pdfdiff/core";
import { runRasterDiffJob, type RasterDiffJob, type RasterDiffJobResult } from "./raster-diff-job.js";
import type { RasterDiffRequest, RasterDiffResponse } from "./raster-diff-worker.js";

/** Supplied by the host, which is the only side that knows how its bundler emits workers. */
export type RasterDiffWorkerFactory = () => Worker;

export interface RasterDiffClient {
  run(job: RasterDiffJob, signal: AbortSignal, metrics?: DiffMetricSink): Promise<RasterDiffJobResult>;
}

function replay(metrics: DiffMetricSink | undefined, result: RasterDiffJobResult): RasterDiffJobResult {
  if (metrics) for (const metric of result.metrics) metrics(metric);
  return result;
}

/**
 * Runs raster diffs on a worker, so the ~90ms of pixel work a page costs stops
 * landing on the main thread between canvas renders. One worker is enough to
 * empty the main thread; page rendering is still serial on it, so a pool would
 * add contention without shortening the critical path.
 *
 * Falls back to running in-process whenever a worker is unavailable or fails,
 * so a blocked Worker constructor costs responsiveness and nothing else.
 */
export function createRasterDiffClient(createWorker?: RasterDiffWorkerFactory): RasterDiffClient {
  let worker: Worker | null = null;
  let unavailable = !createWorker;
  // A worker that fails to load fails on its first message, by which point a
  // transferred buffer is detached and the page cannot be retried in-process.
  // The first job is copied instead, so proving the worker costs one page of
  // memcpy rather than the whole comparison.
  let proven = false;
  let nextId = 1;
  // The batch pass keeps a page of lookahead, so two jobs can be in flight.
  const pending = new Map<number, { resolve: (result: RasterDiffJobResult) => void; reject: (error: unknown) => void }>();

  const ensureWorker = (): Worker | null => {
    if (unavailable) return null;
    if (worker) return worker;
    try {
      const created = createWorker!();
      created.onmessage = (event: MessageEvent<RasterDiffResponse>) => {
        const entry = pending.get(event.data.id);
        if (!entry) return;
        pending.delete(event.data.id);
        if (event.data.ok) entry.resolve(event.data);
        else entry.reject(new Error(event.data.message));
      };
      created.onerror = () => {
        // The worker died mid-flight: every job it held is lost, and the
        // in-process path takes over for the rest of the comparison.
        unavailable = true;
        worker?.terminate();
        worker = null;
        for (const entry of pending.values()) entry.reject(new Error("The raster diff worker stopped."));
        pending.clear();
      };
      worker = created;
      return worker;
    } catch {
      unavailable = true;
      return null;
    }
  };

  return {
    async run(job, signal, metrics) {
      throwIfAborted(signal);
      const active = ensureWorker();
      if (!active) return replay(metrics, runRasterDiffJob(job));

      const id = nextId++;
      try {
        const result = await new Promise<RasterDiffJobResult>((resolve, reject) => {
          const onAbort = (): void => {
            pending.delete(id);
            reject(new PdfDiffAbortError());
          };
          signal.addEventListener("abort", onAbort, { once: true });
          pending.set(id, {
            resolve: (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
            reject: (error) => { signal.removeEventListener("abort", onAbort); reject(error); },
          });
          active.postMessage({ id, ...job } satisfies RasterDiffRequest, proven ? [job.earlier, job.newer] : []);
        });
        proven = true;
        return replay(metrics, result);
      } catch (error) {
        if (signal.aborted) throw new PdfDiffAbortError();
        // Before the worker has proven itself the job still owns its buffers,
        // so the page can still be compared here rather than lost.
        if (!proven) return replay(metrics, runRasterDiffJob(job));
        throw error;
      }
    },
  };
}
