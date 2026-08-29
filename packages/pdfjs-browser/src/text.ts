import { Util } from "pdfjs-dist";
import { measureAsync, throwIfAborted } from "@pdfdiff/core";
import type { DocumentTextOptions, LoadedPdf } from "./types.js";
import type { PageText, PositionedTextItem, TextBounds, TextQuad } from "@pdfdiff/core";

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
  return typeof item === "object" && item !== null && "str" in item && typeof item.str === "string" && "transform" in item && Array.isArray(item.transform);
}

function pageNumberError(pageNumber: number, pageCount: number): RangeError {
  return new RangeError(`Page ${pageNumber} is outside the document's 1-${pageCount} range.`);
}

function geometryForTextItem(item: PdfTextItem, pageTransform: number[]): { bounds: TextBounds; quad: TextQuad } {
  const sourceTransform = item.transform.map((value) => Number(value));
  const transform = Util.transform(pageTransform, sourceTransform);
  const angle = Math.atan2(transform[1]!, transform[0]!);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const fontSize = Math.max(0.01, Math.hypot(transform[2]!, transform[3]!));
  const ascent = fontSize * 0.8;
  const width = Math.max(0, Number.isFinite(item.width) ? item.width : 0);
  const textHeight = Math.max(fontSize, Number.isFinite(item.height) ? item.height : fontSize);
  const topLeftX = transform[4]! + sine * ascent;
  const topLeftY = transform[5]! - cosine * ascent;
  const bottomLeftX = topLeftX - sine * textHeight;
  const bottomLeftY = topLeftY + cosine * textHeight;
  const topRightX = topLeftX + cosine * width;
  const topRightY = topLeftY + sine * width;
  const bottomRightX = bottomLeftX + cosine * width;
  const bottomRightY = bottomLeftY + sine * width;
  const quad: TextQuad = [
    { x: topLeftX, y: topLeftY },
    { x: topRightX, y: topRightY },
    { x: bottomRightX, y: bottomRightY },
    { x: bottomLeftX, y: bottomLeftY },
  ];
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  return {
    bounds: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(0, Math.max(...xs) - Math.min(...xs)),
      height: Math.max(0, Math.max(...ys) - Math.min(...ys)),
    },
    quad,
  };
}

/** Extract native, positioned PDF text. OCR is intentionally outside this adapter. */
async function extractPageTextUnmeasured(
  pdf: LoadedPdf,
  pageNumber: number,
  options: Pick<DocumentTextOptions, "signal" | "disableNormalization" | "includeMarkedContent"> = {},
): Promise<PageText> {
  throwIfAborted(options.signal);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.pageCount) throw pageNumberError(pageNumber, pdf.pageCount);
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
    const textStart = text.length;
    const textEnd = textStart + str.length;
    const geometry = geometryForTextItem(item, viewport.transform);
    items.push({
      pageNumber,
      str,
      textStart,
      textEnd,
      dir: item.dir,
      fontName: item.fontName,
      width: item.width,
      height: item.height,
      fontSize: Math.max(0.01, Math.hypot(Number(item.transform[2]), Number(item.transform[3]))),
      hasEOL: item.hasEOL,
      transform: item.transform.map((value) => Number(value)),
      bounds: geometry.bounds,
      quad: geometry.quad,
    });
    text += str;
    if (item.hasEOL) text += "\n";
  }
  return { pageNumber, width: viewport.width, height: viewport.height, items, text, hasText: items.some((item) => item.str.length > 0) };
}

export function extractPageText(
  pdf: LoadedPdf,
  pageNumber: number,
  options: Pick<DocumentTextOptions, "signal" | "disableNormalization" | "includeMarkedContent" | "metrics"> = {},
): Promise<PageText> {
  return measureAsync(options.metrics, "pdf.text.page", () => extractPageTextUnmeasured(pdf, pageNumber, options), { pageNumber });
}

export async function extractDocumentText(pdf: LoadedPdf, options: DocumentTextOptions = {}): Promise<readonly PageText[]> {
  const pages: PageText[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.pageCount; pageNumber += 1) {
    throwIfAborted(options.signal);
    pages.push(await extractPageText(pdf, pageNumber, options));
    options.onProgress?.({ completed: pageNumber, total: pdf.pageCount });
  }
  return pages;
}
