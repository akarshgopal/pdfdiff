import { Util } from "pdfjs-dist";

import { throwIfAborted } from "./errors";
import type {
  DocumentTextOptions,
  LoadedPdf,
  PageText,
  PositionedTextItem,
  TextBounds,
} from "./types";

type PdfTextItem = {
  str: string;
  dir: string;
  transform: Array<unknown>;
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
};

function isTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string" &&
    "transform" in item &&
    Array.isArray(item.transform)
  );
}

function pageNumberError(pageNumber: number, pageCount: number): RangeError {
  return new RangeError(`Page ${pageNumber} is outside the document's 1-${pageCount} range.`);
}

function boundsForTextItem(item: PdfTextItem, pageTransform: number[]): TextBounds {
  const sourceTransform = item.transform.map((value) => Number(value));
  const transform = Util.transform(pageTransform, sourceTransform);
  const angle = Math.atan2(transform[1], transform[0]);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const fontSize = Math.max(0.01, Math.hypot(transform[2], transform[3]));
  const ascent = fontSize * 0.8;
  const width = Math.max(0, Number.isFinite(item.width) ? item.width : 0);
  const textHeight = Math.max(fontSize, Number.isFinite(item.height) ? item.height : fontSize);

  // PDF.js positions text at the baseline. Build an oriented text rectangle,
  // then return its axis-aligned bounds for simple overlay/highlight clients.
  const topLeftX = transform[4] + sine * ascent;
  const topLeftY = transform[5] - cosine * ascent;
  const bottomLeftX = topLeftX - sine * textHeight;
  const bottomLeftY = topLeftY + cosine * textHeight;
  const topRightX = topLeftX + cosine * width;
  const topRightY = topLeftY + sine * width;
  const bottomRightX = bottomLeftX + cosine * width;
  const bottomRightY = bottomLeftY + sine * width;
  const xs = [topLeftX, topRightX, bottomLeftX, bottomRightX];
  const ys = [topLeftY, topRightY, bottomLeftY, bottomRightY];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/** Extract native (non-OCR) text and its page-space positions. */
export async function extractPageText(
  pdf: LoadedPdf,
  pageNumber: number,
  options: Pick<DocumentTextOptions, "signal" | "disableNormalization" | "includeMarkedContent"> = {},
): Promise<PageText> {
  throwIfAborted(options.signal);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.pageCount) {
    throw pageNumberError(pageNumber, pdf.pageCount);
  }
  const page = await pdf.pdf.getPage(pageNumber);
  throwIfAborted(options.signal);
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const content = await page.getTextContent({
    includeMarkedContent: options.includeMarkedContent ?? false,
    disableNormalization: options.disableNormalization ?? false,
  });
  throwIfAborted(options.signal);

  const items: PositionedTextItem[] = [];
  let text = "";
  for (const item of content.items) {
    if (!isTextItem(item)) continue;
    throwIfAborted(options.signal);
    const str = item.str;
    items.push({
      pageNumber,
      str,
      dir: item.dir,
      fontName: item.fontName,
      width: item.width,
      height: item.height,
      fontSize: Math.max(0.01, Math.hypot(Number(item.transform[2]), Number(item.transform[3]))),
      hasEOL: item.hasEOL,
      transform: item.transform.map((value) => Number(value)),
      bounds: boundsForTextItem(item, viewport.transform),
    });
    text += str;
    if (item.hasEOL) text += "\n";
  }

  return {
    pageNumber,
    items,
    text,
    hasText: items.some((item) => item.str.length > 0),
  };
}

/** Extract positioned native text for every page in document order. */
export async function extractDocumentText(
  pdf: LoadedPdf,
  options: DocumentTextOptions = {},
): Promise<readonly PageText[]> {
  const pages: PageText[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.pageCount; pageNumber += 1) {
    throwIfAborted(options.signal);
    pages.push(await extractPageText(pdf, pageNumber, options));
    options.onProgress?.({ completed: pageNumber, total: pdf.pageCount });
  }
  return pages;
}
