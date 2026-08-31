import { isDecodableText, measureAsync, throwIfAborted } from "@pdfdiff/core";
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

function validatePageNumber(pageNumber: number, pageCount: number): void {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) throw pageNumberError(pageNumber, pageCount);
}

/** 2D affine multiply, inlined so this extractor carries no DOM-bound import. */
function multiplyTransform(first: readonly number[], second: readonly number[]): number[] {
  return [
    first[0]! * second[0]! + first[2]! * second[1]!,
    first[1]! * second[0]! + first[3]! * second[1]!,
    first[0]! * second[2]! + first[2]! * second[3]!,
    first[1]! * second[2]! + first[3]! * second[3]!,
    first[0]! * second[4]! + first[2]! * second[5]! + first[4]!,
    first[1]! * second[4]! + first[3]! * second[5]! + first[5]!,
  ];
}

function geometryForTextItem(item: PdfTextItem, pageTransform: number[]): { bounds: TextBounds; quad: TextQuad } {
  const sourceTransform = item.transform.map((value) => Number(value));
  const transform = multiplyTransform(pageTransform, sourceTransform);
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

function positionedTextItem(item: PdfTextItem, pageNumber: number, pageTransform: number[], textStart: number): PositionedTextItem {
  const geometry = geometryForTextItem(item, pageTransform);
  return {
    pageNumber,
    str: item.str,
    textStart,
    textEnd: textStart + item.str.length,
    dir: item.dir,
    fontName: item.fontName,
    width: item.width,
    height: item.height,
    fontSize: Math.max(0.01, Math.hypot(Number(item.transform[2]), Number(item.transform[3]))),
    hasEOL: item.hasEOL,
    transform: item.transform.map((value) => Number(value)),
    bounds: geometry.bounds,
    quad: geometry.quad,
  };
}

function hasWhitespaceBoundary(previous: PositionedTextItem, current: PositionedTextItem): boolean {
  if (!previous.str || !current.str) return true;
  return /\s$/u.test(previous.str) || /^\s/u.test(current.str);
}

function itemsShareLine(previous: PositionedTextItem, current: PositionedTextItem): boolean {
  const previousBottom = previous.bounds.y + previous.bounds.height;
  const currentBottom = current.bounds.y + current.bounds.height;
  const overlap = Math.min(previousBottom, currentBottom) - Math.max(previous.bounds.y, current.bounds.y);
  const minHeight = Math.max(0.01, Math.min(previous.bounds.height, current.bounds.height));
  const previousCenter = previous.bounds.y + previous.bounds.height / 2;
  const currentCenter = current.bounds.y + current.bounds.height / 2;
  return overlap >= minHeight * 0.25 || Math.abs(previousCenter - currentCenter) <= Math.max(previous.fontSize, current.fontSize) * 0.55;
}

function averageCharacterWidth(previous: PositionedTextItem, current: PositionedTextItem): number {
  const previousWidth = previous.bounds.width / Math.max(1, previous.str.length);
  const currentWidth = current.bounds.width / Math.max(1, current.str.length);
  return Math.max(1, (previousWidth + currentWidth) / 2);
}

function separatorBetween(previous: PositionedTextItem | undefined, current: PositionedTextItem): string {
  if (!previous) return "";
  if (previous.hasEOL) return "\n";
  if (hasWhitespaceBoundary(previous, current)) return "";
  if (!itemsShareLine(previous, current)) return "\n";

  const characterWidth = averageCharacterWidth(previous, current);
  const horizontalGap = current.bounds.x - (previous.bounds.x + previous.bounds.width);
  if (current.bounds.x + characterWidth < previous.bounds.x) return "\n";
  return horizontalGap > characterWidth * 0.18 ? " " : "";
}

/** Extract native, positioned PDF text. OCR is intentionally outside this adapter. */
async function extractPageTextUnmeasured(
  pdf: LoadedPdf,
  pageNumber: number,
  options: Pick<DocumentTextOptions, "signal"> = {},
): Promise<PageText> {
  throwIfAborted(options.signal);
  validatePageNumber(pageNumber, pdf.pageCount);
  const page = await pdf.pdf.getPage(pageNumber);
  throwIfAborted(options.signal);
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
  throwIfAborted(options.signal);
  const items: PositionedTextItem[] = [];
  let text = "";
  for (const item of content.items) {
    if (!isTextItem(item)) continue;
    throwIfAborted(options.signal);
    const draft = positionedTextItem(item, pageNumber, viewport.transform, 0);
    text += separatorBetween(items.at(-1), draft);
    const positioned = { ...draft, textStart: text.length, textEnd: text.length + draft.str.length };
    items.push(positioned);
    text += item.str;
  }
  if (items.at(-1)?.hasEOL) text += "\n";
  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    items,
    text,
    hasText: items.some((item) => item.str.length > 0),
    decodable: isDecodableText(text),
  };
}

export function extractPageText(
  pdf: LoadedPdf,
  pageNumber: number,
  options: Pick<DocumentTextOptions, "signal" | "metrics"> = {},
): Promise<PageText> {
  return measureAsync(options.metrics, "pdf.text.page", () => extractPageTextUnmeasured(pdf, pageNumber, options), { pageNumber });
}

const TEXT_CONCURRENCY = 4;

export async function extractDocumentText(pdf: LoadedPdf, options: DocumentTextOptions = {}): Promise<readonly PageText[]> {
  const pages: PageText[] = new Array(pdf.pageCount);
  let next = 1;
  let completed = 0;
  const worker = async (): Promise<void> => {
    for (let pageNumber = next++; pageNumber <= pdf.pageCount; pageNumber = next++) {
      throwIfAborted(options.signal);
      pages[pageNumber - 1] = await extractPageText(pdf, pageNumber, options);
      completed += 1;
      options.onProgress?.({ completed, total: pdf.pageCount });
    }
  };
  await Promise.all(Array.from({ length: Math.min(TEXT_CONCURRENCY, pdf.pageCount) }, worker));
  return pages;
}
