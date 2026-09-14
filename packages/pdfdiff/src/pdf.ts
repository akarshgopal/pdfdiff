import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { getDocument, VerbosityLevel, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);

function pdfjsAssetUrls() {
  const root = dirname(require.resolve("pdfjs-dist/package.json"));
  const dir = (name: string) => `${pathToFileURL(join(root, name)).href}/`;
  return {
    standardFontDataUrl: dir("standard_fonts"),
    cMapUrl: dir("cmaps"),
    cMapPacked: true as const,
    wasmUrl: dir("wasm"),
    iccUrl: dir("iccs"),
  };
}

export interface LoadedPdf {
  readonly name: string;
  readonly pageCount: number;
  readonly pdf: PDFDocumentProxy;
  destroy(): Promise<void>;
}

/** Load a PDF from disk with PDF.js sidecar assets so fonts and images render faithfully. */
export async function loadPdf(path: string): Promise<LoadedPdf> {
  const data = new Uint8Array(await readFile(path));
  const task = getDocument({ data, verbosity: VerbosityLevel.ERRORS, ...pdfjsAssetUrls() });
  const pdf = await task.promise;
  return {
    name: basename(path),
    pageCount: pdf.numPages,
    pdf,
    destroy: () => task.destroy(),
  };
}
