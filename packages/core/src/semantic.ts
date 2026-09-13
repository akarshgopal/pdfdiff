import { measure } from "./instrumentation.js";
import type { PageText } from "./types.js";
import { spatialPageDiff } from "./semantic-spatial.js";
import type { SemanticDiffOptions } from "./semantic-token.js";
import type { SemanticPageDiff } from "./semantic-types.js";

export type {
  SemanticChangeKind,
  SemanticPageDiff,
  SemanticRunKind,
  SemanticTextChange,
  SemanticTextDiff,
  SemanticTextOverlay,
  SemanticTextRun,
  UnchangedTextLine,
} from "./semantic-types.js";
export { diffSemanticText } from "./semantic-token.js";

/** Compare extracted page text while retaining native PDF locations. */
export function diffSemanticPages(
  beforePage: PageText,
  afterPage: PageText,
  options: SemanticDiffOptions = {},
): SemanticPageDiff {
  return measure(options.metrics, "core.semantic.page", () => spatialPageDiff(beforePage, afterPage, options), {
    beforeCharacters: beforePage.text.length,
    afterCharacters: afterPage.text.length,
    beforeItems: beforePage.items.length,
    afterItems: afterPage.items.length,
  });
}
