import {
  alignPages,
  buildReport,
  diffSemanticPages,
  zeroClassCounts,
  type AlignedPagePair,
  type ComparisonPage,
  type ComparisonReport,
  type PageText,
} from "@pdfdiff/core";
import { readDocumentText, type DocumentText } from "./text.js";

export interface HeadlessCompareOptions {
  readonly matchThreshold?: number;
  readonly detectMoves?: boolean;
}

const EMPTY_PAGE: PageText = { pageNumber: 0, width: 0, height: 0, items: [], text: "", hasText: false };

function pageTextOrEmpty(document: DocumentText, pageNumber: number | undefined): PageText {
  return pageNumber ? document.pages[pageNumber - 1] ?? EMPTY_PAGE : EMPTY_PAGE;
}

function statusFor(pair: AlignedPagePair, changeCount: number): ComparisonPage["status"] {
  if (pair.kind === "added") return "added";
  if (pair.kind === "removed") return "removed";
  return changeCount > 0 ? "changed" : "same";
}

/**
 * A text-only comparison: page alignment plus the semantic diff. Everything a
 * pipeline needs to answer "did the wording change", with no rasteriser.
 */
function comparePair(pair: AlignedPagePair, index: number, earlier: DocumentText, newer: DocumentText): ComparisonPage {
  const before = pageTextOrEmpty(earlier, pair.earlierPageNumber);
  const after = pageTextOrEmpty(newer, pair.newerPageNumber);
  const semantic = diffSemanticPages(before, after);
  const changeCount = semantic.changes.length;
  return {
    index,
    earlierPageNumber: pair.earlierPageNumber,
    newerPageNumber: pair.newerPageNumber,
    alignment: pair.kind,
    similarity: pair.similarity,
    status: statusFor(pair, changeCount),
    noticeable: changeCount > 0 || pair.kind !== "matched",
    changeClasses: { ...zeroClassCounts(), content: changeCount },
    semantic,
  };
}

export interface HeadlessComparison {
  readonly report: ComparisonReport;
  readonly alignment: readonly AlignedPagePair[];
}

export async function comparePdfText(earlierPath: string, newerPath: string, options: HeadlessCompareOptions = {}): Promise<HeadlessComparison> {
  const [earlier, newer] = await Promise.all([readDocumentText(earlierPath), readDocumentText(newerPath)]);
  const alignment = alignPages(earlier.fingerprints, newer.fingerprints, {
    matchThreshold: options.matchThreshold,
    detectMoves: options.detectMoves,
  });
  const pages = alignment.map((pair, index) => comparePair(pair, index, earlier, newer));
  return {
    alignment,
    report: buildReport({ earlierName: earlier.name, newerName: newer.name, pages, alignment }),
  };
}
