import type { TextQuad } from "./types.js";

export type SemanticRunKind = "same" | "added" | "removed" | "changed";
export type SemanticChangeKind = Exclude<SemanticRunKind, "same">;

export interface SemanticTextRun {
  readonly id: string;
  readonly text: string;
  readonly kind: SemanticRunKind;
}

export interface SemanticTextChange {
  readonly id: string;
  readonly kind: SemanticChangeKind;
  readonly before: string;
  readonly after: string;
}

export interface SemanticTextDiff {
  /** True when a side carried text that could not be decoded to real characters. */
  readonly textUndecodable?: boolean;
  readonly before: readonly SemanticTextRun[];
  readonly after: readonly SemanticTextRun[];
  readonly changes: readonly SemanticTextChange[];
  readonly beforeTokenCount: number;
  readonly afterTokenCount: number;
  readonly hasBeforeText: boolean;
  readonly hasAfterText: boolean;
}

export interface SemanticTextOverlay {
  readonly id: string;
  readonly kind: SemanticChangeKind;
  readonly text: string;
  readonly quads: readonly TextQuad[];
}

export interface SemanticPageDiff extends SemanticTextDiff {
  readonly beforeOverlays: readonly SemanticTextOverlay[];
  readonly afterOverlays: readonly SemanticTextOverlay[];
  /** Lines whose text is identical on both sides, with where each side drew them. */
  readonly unchangedLines?: readonly UnchangedTextLine[];
}

/**
 * An unchanged line that moved still repaints every pixel it touches. Keeping
 * both positions lets a caller tell a genuine edit from text pushed down the
 * page by an edit somewhere above it.
 */
export interface UnchangedTextLine {
  readonly text: string;
  readonly beforeQuads: readonly TextQuad[];
  readonly afterQuads: readonly TextQuad[];
  readonly shifted: boolean;
}
