import { resultTransfers, runRasterDiffJob, type RasterDiffJob, type RasterDiffJobResult } from "./raster-diff-job.js";

export interface RasterDiffRequest extends RasterDiffJob {
  readonly id: number;
}

export type RasterDiffResponse =
  | ({ readonly id: number; readonly ok: true } & RasterDiffJobResult)
  | { readonly id: number; readonly ok: false; readonly message: string };

/** The slice of a worker scope this needs, so the package compiles without the WebWorker lib. */
interface WorkerScope {
  onmessage: ((event: MessageEvent<RasterDiffRequest>) => void) | null;
  postMessage(message: RasterDiffResponse, transfer: Transferable[]): void;
}

/**
 * Body of the raster diff worker. The host owns the `new Worker(...)` call —
 * only it knows how its bundler emits the module — so it supplies a one-line
 * worker file that calls this.
 */
export function serveRasterDiffWorker(scope: WorkerScope = globalThis as unknown as WorkerScope): void {
  scope.onmessage = (event: MessageEvent<RasterDiffRequest>) => {
    const { id, ...job } = event.data;
    try {
      const result = runRasterDiffJob(job);
      scope.postMessage({ id, ok: true, ...result } satisfies RasterDiffResponse, resultTransfers(result));
    } catch (error) {
      // A failed page must not take the worker down with it; the client falls
      // back to comparing that page on the main thread.
      scope.postMessage({ id, ok: false, message: error instanceof Error ? error.message : "Raster diff failed." } satisfies RasterDiffResponse, []);
    }
  };
}
