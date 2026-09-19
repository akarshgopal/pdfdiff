import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask } from "pdfjs-dist";
import { measureAsync } from "@pdfdiff/core";
import type { LoadedPdf, PdfLoadOptions, PdfSource } from "./types.js";

function isFile(source: PdfSource): source is File {
  return typeof File !== "undefined" && source instanceof File;
}

async function readSource(source: PdfSource, signal?: PdfLoadOptions["signal"]): Promise<Uint8Array> {
  signal?.throwIfAborted();
  if (isFile(source)) {
    // arrayBuffer() already hands back a private copy; slicing it again doubles
    // peak memory for no benefit on files this size.
    const buffer = await source.arrayBuffer();
    signal?.throwIfAborted();
    return new Uint8Array(buffer);
  }
  if (source instanceof ArrayBuffer) return new Uint8Array(source).slice();
  return source.slice();
}

function configureWorker(workerSrc?: string): void {
  if (workerSrc) GlobalWorkerOptions.workerSrc = workerSrc;
  else if (!GlobalWorkerOptions.workerSrc) throw new Error("Configure a PDF.js worker URL before loading a PDF.");
}

/** PDF.js resolves these itself, and only fetches them when a document needs them. */
function assetUrls(assetBaseUrl: string | undefined) {
  if (!assetBaseUrl) return {};
  const base = assetBaseUrl.endsWith("/") ? assetBaseUrl : `${assetBaseUrl}/`;
  return {
    standardFontDataUrl: `${base}standard_fonts/`,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
  };
}

function sourceType(source: PdfSource): "file" | "array-buffer" | "uint8-array" {
  if (isFile(source)) return "file";
  return source instanceof ArrayBuffer ? "array-buffer" : "uint8-array";
}

function watchAbort(
  task: PDFDocumentLoadingTask,
  signal?: PdfLoadOptions["signal"],
): { promise: Promise<never>; detach: () => void } {
  let rejectAbort: (reason: DOMException) => void = () => undefined;
  const promise = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = (): void => {
    void task.destroy();
    rejectAbort(new DOMException("The PDF operation was cancelled.", "AbortError"));
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  return { promise, detach: () => signal?.removeEventListener("abort", onAbort) };
}

/** Load a PDF from caller-provided bytes. No URL fetch is performed. */
export async function loadPdf(source: PdfSource, options: PdfLoadOptions = {}): Promise<LoadedPdf> {
  options.signal?.throwIfAborted();
  configureWorker(options.workerSrc);

  const data = await measureAsync(options.metrics, "pdf.source.read", () => readSource(source, options.signal), {
    sourceType: sourceType(source),
  });
  options.signal?.throwIfAborted();
  const task = getDocument({ data, ...assetUrls(options.assetBaseUrl) });
  const abort = watchAbort(task, options.signal);

  try {
    const pdf = await measureAsync(
      options.metrics,
      "pdf.document.load",
      async () => {
        const loaded = await Promise.race([task.promise, abort.promise]);
        options.signal?.throwIfAborted();
        return loaded;
      },
      { bytes: data.byteLength },
    );
    return {
      pdf,
      name: isFile(source) ? source.name : undefined,
      byteLength: data.byteLength,
      pageCount: pdf.numPages,
      fingerprint: pdf.fingerprints?.[0] ?? null,
      destroy: () => task.destroy(),
    };
  } catch (error) {
    await task.destroy().catch(() => undefined);
    options.signal?.throwIfAborted();
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
