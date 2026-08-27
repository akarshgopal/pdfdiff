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

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PdfDiffAbortError();
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof PdfDiffAbortError ||
    (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "RenderingCancelledException"))
  );
}

export function assertBrowser(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new PdfDiffError(
      "browser-only",
      "PDF rendering requires a browser document. Keep PDF diffing on the client.",
    );
  }
}
