import { readFile } from "node:fs/promises";
import { fingerprintPage, type PageFingerprint, type PageText } from "@pdfdiff/core";
import { extractPageText } from "@pdfdiff/pdfjs-browser/text";

/**
 * Alignment and the semantic diff both run on extracted text alone, so the
 * headless path needs no canvas and no native dependency. Rasterising for a
 * visual diff would; that stays a browser concern for now.
 *
 * The positioned extractor is shared with the browser adapter so a CLI report
 * describes changes in the same line-level terms the viewer shows.
 */

export interface DocumentText {
  readonly name: string;
  readonly pageCount: number;
  readonly pages: readonly PageText[];
  readonly fingerprints: readonly PageFingerprint[];
}

export async function readDocumentText(path: string): Promise<DocumentText> {
  const { getDocument, VerbosityLevel } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(path));
  const task = getDocument({ data, useSystemFonts: true, verbosity: VerbosityLevel.ERRORS });
  const pdf = await task.promise;
  const loaded = { pdf, pageCount: pdf.numPages, byteLength: data.byteLength, fingerprint: null, destroy: () => task.destroy() };
  try {
    const pages: PageText[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      pages.push(await extractPageText(loaded, pageNumber));
    }
    return {
      name: path.split("/").pop() ?? path,
      pageCount: pdf.numPages,
      pages,
      fingerprints: pages.map((page) => fingerprintPage(page.text, page.pageNumber)),
    };
  } finally {
    await task.destroy();
  }
}
