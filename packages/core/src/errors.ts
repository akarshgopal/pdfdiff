import type { AbortSignalLike } from "./types.js";

export class PdfDiffError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PdfDiffError";
    this.code = code;
  }
}

export class PdfDiffAbortError extends PdfDiffError {
  constructor(message = "The PDF operation was cancelled.") {
    super("aborted", message);
    this.name = "AbortError";
  }
}

export function throwIfAborted(signal?: AbortSignalLike): void {
  if (signal?.aborted) throw new PdfDiffAbortError();
}

export function isAbortError(error: unknown): boolean {
  return error instanceof PdfDiffAbortError || (error instanceof Error && (
    error.name === "AbortError" || error.name === "RenderingCancelledException"
  ));
}
