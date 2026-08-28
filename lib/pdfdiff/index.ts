export * from "./errors";
export * from "./types";
export * from "./worker";
export * from "./pdf";
export * from "./render";
export * from "./text";
export { findChangeRegions } from "./regions";
export { diffImages, diffRenderedPages } from "./visual-diff";
export { diffSemanticText, diffSemanticPages } from "./semantic";
export type {
  SemanticRunKind,
  SemanticChangeKind,
  SemanticTextRun,
  SemanticTextChange,
  SemanticTextDiff,
  SemanticTextOverlay,
  SemanticPageDiff,
} from "./semantic";

import { loadPdf } from "./pdf";
import type { LoadedPdf, PdfLoadOptions, PdfSource } from "./types";

/** Load both local documents with the same cancellation and progress options. */
export async function loadPdfPair(
  earlierSource: PdfSource,
  newerSource: PdfSource,
  options: PdfLoadOptions = {},
): Promise<{ earlier: LoadedPdf; newer: LoadedPdf }> {
  const earlier = await loadPdf(earlierSource, options);
  try {
    const newer = await loadPdf(newerSource, options);
    return { earlier, newer };
  } catch (error) {
    await earlier.destroy().catch(() => undefined);
    throw error;
  }
}

/** More descriptive alias for callers that want to make normalization explicit. */
export { renderPagePair as renderNormalizedPagePair } from "./render";

/** More descriptive alias for callers using the engine as a comparator. */
export { diffImages as compareImages, diffRenderedPages as compareRenderedPages } from "./visual-diff";
