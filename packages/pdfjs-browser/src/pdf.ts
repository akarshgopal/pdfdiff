import { getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";
import { measureAsync, PdfDiffAbortError, throwIfAborted } from "@pdfdiff/core";
import { configurePdfWorker, getConfiguredWorkerUrl } from "./worker.js";
import type { LoadedPdf, PdfLoadOptions, PdfSource } from "./types.js";

function isFile(source: PdfSource): source is File {
  return typeof File !== "undefined" && source instanceof File;
}

async function readSource(source: PdfSource, signal?: PdfLoadOptions["signal"]): Promise<Uint8Array> {
  throwIfAborted(signal);
  if (isFile(source)) {
    const buffer = await source.arrayBuffer();
    throwIfAborted(signal);
    return new Uint8Array(buffer).slice();
  }
  if (source instanceof ArrayBuffer) return new Uint8Array(source).slice();
  return source.slice();
}

function getFingerprint(pdf: PDFDocumentProxy): string | null {
  return pdf.fingerprints?.[0] ?? null;
}

function configureWorker(workerSrc?: string): void {
  if (workerSrc) configurePdfWorker(workerSrc);
  else if (!getConfiguredWorkerUrl()) throw new Error("Configure a PDF.js worker URL before loading a PDF.");
}

function sourceType(source: PdfSource): "file" | "array-buffer" | "uint8-array" {
  if (isFile(source)) return "file";
  return source instanceof ArrayBuffer ? "array-buffer" : "uint8-array";
}

function watchAbort(task: PDFDocumentLoadingTask, signal?: PdfLoadOptions["signal"]): { promise: Promise<never>; detach: () => void } {
  let rejectAbort: (reason: PdfDiffAbortError) => void = () => undefined;
  const promise = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = (): void => {
    void task.destroy();
    rejectAbort(new PdfDiffAbortError());
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  return { promise, detach: () => signal?.removeEventListener("abort", onAbort) };
}

/** Load a PDF from caller-provided bytes. No URL fetch is performed. */
export async function loadPdf(source: PdfSource, options: PdfLoadOptions = {}): Promise<LoadedPdf> {
  throwIfAborted(options.signal);
  configureWorker(options.workerSrc);

  const data = await measureAsync(options.metrics, "pdf.source.read", () => readSource(source, options.signal), { sourceType: sourceType(source) });
  throwIfAborted(options.signal);
  const task = getDocument({ data });
  const abort = watchAbort(task, options.signal);

  try {
    const pdf = await measureAsync(options.metrics, "pdf.document.load", async () => {
      const loaded = await Promise.race([task.promise, abort.promise]);
      throwIfAborted(options.signal);
      return loaded;
    }, { bytes: data.byteLength });
    return {
      pdf,
      name: isFile(source) ? source.name : undefined,
      byteLength: data.byteLength,
      pageCount: pdf.numPages,
      fingerprint: getFingerprint(pdf),
      destroy: () => task.destroy(),
    };
  } catch (error) {
    await task.destroy().catch(() => undefined);
    if (options.signal?.aborted) throw new PdfDiffAbortError();
    throw error;
  } finally {
    abort.detach();
  }
}

export async function loadPdfPair(
  earlierSource: PdfSource,
  newerSource: PdfSource,
  options: PdfLoadOptions = {},
): Promise<{ earlier: LoadedPdf; newer: LoadedPdf }> {
  const [earlierResult, newerResult] = await Promise.allSettled([
    loadPdf(earlierSource, options),
    loadPdf(newerSource, options),
  ]);
  if (earlierResult.status === "fulfilled" && newerResult.status === "fulfilled") {
    return { earlier: earlierResult.value, newer: newerResult.value };
  }
  await Promise.allSettled([
    earlierResult.status === "fulfilled" ? earlierResult.value.destroy() : Promise.resolve(),
    newerResult.status === "fulfilled" ? newerResult.value.destroy() : Promise.resolve(),
  ]);
  if (earlierResult.status === "rejected") throw earlierResult.reason;
  if (newerResult.status === "rejected") throw newerResult.reason;
  throw new Error("Unable to load the PDF pair.");
}
