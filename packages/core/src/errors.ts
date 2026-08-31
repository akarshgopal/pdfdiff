import type { AbortSignalLike } from "./types.js";

export class PdfDiffAbortError extends Error {
  constructor(message = "The PDF operation was cancelled.") {
    super(message);
    this.name = "AbortError";
  }
}

export function throwIfAborted(signal?: AbortSignalLike): void {
  if (signal?.aborted) throw new PdfDiffAbortError();
}
