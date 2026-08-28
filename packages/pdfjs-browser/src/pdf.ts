import { getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";
import { PdfDiffAbortError, throwIfAborted } from "@pdfdiff/core";
import { configurePdfWorker, getConfiguredWorkerUrl } from "./worker.js";
import type { LoadedPdf, PdfLoadOptions, PdfMetadata, PdfSource } from "./types.js";

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

/** Load a PDF from caller-provided bytes. No URL fetch is performed. */
export async function loadPdf(source: PdfSource, options: PdfLoadOptions = {}): Promise<LoadedPdf> {
  throwIfAborted(options.signal);
  if (options.workerSrc) configurePdfWorker(options.workerSrc);
  else if (!getConfiguredWorkerUrl()) throw new Error("Configure a PDF.js worker URL before loading a PDF.");

  const data = await readSource(source, options.signal);
  throwIfAborted(options.signal);
  let task: PDFDocumentLoadingTask | undefined;
  let abortReject: ((reason: PdfDiffAbortError) => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => { abortReject = reject; });

  try {
    task = getDocument({ data, password: options.password });
    task.onProgress = (progress: { loaded: number; total?: number }) => options.onProgress?.(progress.loaded, progress.total);
    const onAbort = (): void => {
      void task?.destroy();
      abortReject?.(new PdfDiffAbortError());
    };
    const signal = options.signal as AbortSignal | undefined;
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    try {
      const pdf = await Promise.race([task.promise, abortPromise]);
      throwIfAborted(options.signal);
      return {
        pdf,
        name: isFile(source) ? source.name : undefined,
        byteLength: data.byteLength,
        pageCount: pdf.numPages,
        fingerprint: getFingerprint(pdf),
        destroy: () => task!.destroy(),
      };
    } catch (error) {
      if (signal?.aborted) throw new PdfDiffAbortError();
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  } catch (error) {
    if (task) await task.destroy().catch(() => undefined);
    if ((options.signal as AbortSignal | undefined)?.aborted) throw new PdfDiffAbortError();
    throw error;
  }
}

export async function loadPdfPair(
  earlierSource: PdfSource,
  newerSource: PdfSource,
  options: PdfLoadOptions = {},
): Promise<{ earlier: LoadedPdf; newer: LoadedPdf }> {
  const earlier = await loadPdf(earlierSource, options);
  try {
    const newer = await loadPdf(newerSource, options);
    return { earlier, newer };
  } catch (error) {
    await earlier.destroy().catch(() => undefined);
    throw error;
  }
}

export async function getPdfMetadata(pdf: LoadedPdf | PDFDocumentProxy, signal?: PdfLoadOptions["signal"]): Promise<PdfMetadata> {
  throwIfAborted(signal);
  const document = "pdf" in pdf ? pdf.pdf : pdf;
  const metadata = await document.getMetadata();
  throwIfAborted(signal);
  const info = metadata.info as unknown as Record<string, unknown>;
  const stringValue = (key: string): string | undefined => typeof info[key] === "string" ? info[key] as string : undefined;
  return {
    pageCount: document.numPages,
    fingerprint: getFingerprint(document),
    title: stringValue("Title"),
    author: stringValue("Author"),
    subject: stringValue("Subject"),
    keywords: stringValue("Keywords"),
    creator: stringValue("Creator"),
    producer: stringValue("Producer"),
    creationDate: stringValue("CreationDate"),
    modificationDate: stringValue("ModDate"),
  };
}

export function getPageCount(pdf: LoadedPdf | PDFDocumentProxy): number {
  return ("pdf" in pdf ? pdf.pdf : pdf).numPages;
}
