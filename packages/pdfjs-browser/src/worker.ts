import { GlobalWorkerOptions } from "pdfjs-dist";

let configuredWorkerUrl: string | undefined;

/** Configure the PDF.js worker once for the current browser bundle. */
export function configurePdfWorker(url: string): string {
  if (!url) throw new Error("A PDF.js worker URL is required.");
  if (!configuredWorkerUrl || configuredWorkerUrl !== url) {
    GlobalWorkerOptions.workerSrc = url;
    configuredWorkerUrl = url;
  }
  return configuredWorkerUrl;
}

export function getConfiguredWorkerUrl(): string | undefined {
  return configuredWorkerUrl;
}
