import { GlobalWorkerOptions } from "pdfjs-dist";

// Vite (and compatible static bundlers) emits the worker as a separate asset.
// Keeping this import here means callers never need to know the deployed URL.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let configuredWorkerUrl: string | undefined;

/** Configure PDF.js's worker once for the current browser bundle. */
export function configurePdfWorker(url = workerUrl): string {
  if (!configuredWorkerUrl || configuredWorkerUrl !== url) {
    GlobalWorkerOptions.workerSrc = url;
    configuredWorkerUrl = url;
  }
  return configuredWorkerUrl;
}

export function getConfiguredWorkerUrl(): string | undefined {
  return configuredWorkerUrl;
}
