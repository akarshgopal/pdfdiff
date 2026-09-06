import { GlobalWorkerOptions } from "pdfjs-dist";

/** Configure the PDF.js worker once for the current browser bundle. */
export function configurePdfWorker(url: string): string {
  if (!url) throw new Error("A PDF.js worker URL is required.");
  GlobalWorkerOptions.workerSrc = url;
  return url;
}

export function getConfiguredWorkerUrl(): string | undefined {
  return GlobalWorkerOptions.workerSrc || undefined;
}
