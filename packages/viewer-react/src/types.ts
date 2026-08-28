import type { SemanticPageDiff } from "@pdfdiff/core";

export type DiffViewMode = "diff" | "semantic-text" | "side-by-side" | "swipe" | "blink" | "earlier" | "newer";
export type SourceSide = "earlier" | "newer";
export type AlignmentMode = "none" | "translation";
export type DiffRegionKind = "added" | "removed" | "changed";

export interface DiffRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: DiffRegionKind;
  label?: string;
}

export interface DiffTextChange {
  id: string;
  text: string;
  kind: DiffRegionKind;
  beforeText?: string;
  afterText?: string;
}

export interface DiffSemanticOverlay {
  id: string;
  kind: DiffRegionKind;
  text: string;
  quads: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>;
}

export interface DiffPage {
  readonly index: number;
  readonly width?: number;
  readonly height?: number;
  readonly status?: "same" | "changed" | "added" | "removed" | "processing" | "error";
  readonly beforeSrc?: string;
  readonly afterSrc?: string;
  readonly diffSrc?: string;
  readonly changedPixels?: number;
  readonly changedPercent?: number;
  readonly regions?: readonly DiffRegion[];
  readonly textChanges?: readonly DiffTextChange[];
  readonly textChangeCount?: number;
  readonly semantic?: SemanticPageDiff;
  readonly semanticBeforeOverlays?: readonly DiffSemanticOverlay[];
  readonly semanticAfterOverlays?: readonly DiffSemanticOverlay[];
  readonly error?: string;
}

export interface DiffComparison {
  readonly earlierName: string;
  readonly newerName: string;
  readonly pages: readonly DiffPage[];
  readonly elapsedMs?: number;
  readonly dispose?: () => void;
}

export interface ViewerAnalyticsEvent {
  name: "view_mode_used";
  mode: DiffViewMode;
}

export interface ViewerOptions {
  readonly sensitivity: number;
  readonly alignment: AlignmentMode;
}

export interface PdfDiffViewerProps {
  comparison: DiffComparison;
  onNewComparison?: () => void;
  onAnalytics?: (event: ViewerAnalyticsEvent) => void;
  initialOptions?: ViewerOptions;
  onOptionsChange?: (options: ViewerOptions) => void;
}
