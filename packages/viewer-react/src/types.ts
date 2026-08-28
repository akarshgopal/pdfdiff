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
  index: number;
  width?: number;
  height?: number;
  status?: "same" | "changed" | "added" | "removed" | "processing" | "error";
  beforeSrc?: string;
  afterSrc?: string;
  diffSrc?: string;
  changedPixels?: number;
  changedPercent?: number;
  regions?: DiffRegion[];
  textChanges?: DiffTextChange[];
  semantic?: SemanticPageDiff;
  semanticBeforeOverlays?: DiffSemanticOverlay[];
  semanticAfterOverlays?: DiffSemanticOverlay[];
  error?: string;
}

export interface DiffComparison {
  earlierName: string;
  newerName: string;
  pages: DiffPage[];
  elapsedMs?: number;
}

export interface ViewerAnalyticsEvent {
  name: "view_mode_used";
  mode: DiffViewMode;
}

export interface ViewerOptions {
  sensitivity: number;
  alignment: AlignmentMode;
}

export interface PdfDiffViewerProps {
  comparison: DiffComparison;
  onNewComparison?: () => void;
  onAnalytics?: (event: ViewerAnalyticsEvent) => void;
  initialOptions?: ViewerOptions;
  onOptionsChange?: (options: ViewerOptions) => void;
}
