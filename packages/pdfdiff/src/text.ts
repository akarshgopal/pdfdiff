import { fingerprintPage, type PageFingerprint, type PageText } from "@pdfdiff/core";
import { extractPageText } from "@pdfdiff/pdfjs-text";
import { loadPdf } from "./pdf.js";

/**
 * Alignment and the semantic diff both run on extracted text. The visual path
 * rasterises separately; this helper stays available for callers that only
 * need wording and page structure.
 */

export interface DocumentText {
  readonly name: string;
  readonly pageCount: number;
  readonly pages: readonly PageText[];
  readonly fingerprints: readonly PageFingerprint[];
}

export async function readDocumentText(path: string): Promise<DocumentText> {
  const loaded = await loadPdf(path);
  try {
    const pages: PageText[] = [];
    for (let pageNumber = 1; pageNumber <= loaded.pageCount; pageNumber += 1) {
      pages.push(await extractPageText(loaded, pageNumber));
    }
    return {
      name: loaded.name,
      pageCount: loaded.pageCount,
      pages,
      fingerprints: pages.map((page) => fingerprintPage(page.text, page.pageNumber)),
    };
  } finally {
    await loaded.destroy();
  }
}
