import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist";

import { assertBrowser, PdfDiffAbortError, throwIfAborted } from "./errors";
import { configurePdfWorker } from "./worker";
import type { LoadedPdf, PdfLoadOptions, PdfMetadata, PdfSource } from "./types";

function isFile(source: PdfSource): source is File {
  return typeof File !== "undefined" && source instanceof File;
}

async function readSource(source: PdfSource, signal?: AbortSignal): Promise<Uint8Array> {
  throwIfAborted(signal);

  if (isFile(source)) {
    const buffer = await source.arrayBuffer();
    throwIfAborted(signal);
    // PDF.js may transfer the typed array to its worker. Keep the caller's
    // ArrayBuffer independent so a retry can still use the original source.
    return new Uint8Array(buffer).slice();
  }

  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source).slice();
  }

  return source.slice();
}

function getFingerprint(pdf: PDFDocumentProxy): string | null {
  return pdf.fingerprints?.[0] ?? null;
}

/**
 * Load a local PDF into PDF.js. No URL fetch is performed: callers provide the
 * bytes and all parsing/rendering stays in the browser worker.
 */
export async function loadPdf(source: PdfSource, options: PdfLoadOptions = {}): Promise<LoadedPdf> {
  assertBrowser();
  throwIfAborted(options.signal);
  configurePdfWorker();

  const data = await readSource(source, options.signal);
  throwIfAborted(options.signal);

  let task: PDFDocumentLoadingTask | undefined;
  let abortReject: ((reason: PdfDiffAbortError) => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    abortReject = reject;
  });

  try {
    task = getDocument({
      data,
      password: options.password,
    });
    task.onProgress = (progress: { loaded: number; total?: number }) => {
      options.onProgress?.(progress.loaded, progress.total);
    };

    const onAbort = (): void => {
      // destroy() also cancels any range requests and the PDF.js worker.
      void task?.destroy();
      abortReject?.(new PdfDiffAbortError());
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();

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
      if (options.signal?.aborted) {
        throw new PdfDiffAbortError();
      }
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
    }
  } catch (error) {
    if (task) {
      // This is idempotent for a task that has already been destroyed.
      await task.destroy().catch(() => undefined);
    }
    if (options.signal?.aborted) {
      throw new PdfDiffAbortError();
    }
    throw error;
  }
}

/** Read the information dictionary without retaining the document's content. */
export async function getPdfMetadata(
  pdf: LoadedPdf | PDFDocumentProxy,
  signal?: AbortSignal,
): Promise<PdfMetadata> {
  throwIfAborted(signal);
  const document = "pdf" in pdf ? pdf.pdf : pdf;
  const metadata = await document.getMetadata();
  throwIfAborted(signal);

  const info = metadata.info as unknown as Record<string, unknown>;
  const stringValue = (key: string): string | undefined => {
    const value = info[key];
    return typeof value === "string" ? value : undefined;
  };

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
