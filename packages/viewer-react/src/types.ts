import type { ChangeClass, ChangeClassCounts, PageAlignmentKind, SemanticPageDiff } from "@pdfdiff/core";

export type { ChangeClass, ChangeClassCounts, PageAlignmentKind };
import type { ReactNode } from "react";

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
  changeClass?: ChangeClass;
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
  /** Source page numbers this row pairs; absent on the side that has no page. */
  readonly earlierPageNumber?: number;
  readonly newerPageNumber?: number;
  readonly alignment?: PageAlignmentKind;
  readonly similarity?: number;
  readonly width?: number;
  readonly height?: number;
  readonly status?: "same" | "changed" | "added" | "removed" | "processing" | "error";
  readonly beforeSrc?: string;
  readonly afterSrc?: string;
  readonly diffSrc?: string;
  readonly changedPixels?: number;
  readonly changedPercent?: number;
  readonly regions?: readonly DiffRegion[];
  readonly changeClasses?: ChangeClassCounts;
  readonly noticeable?: boolean;
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
  readonly earlierPageCount?: number;
  readonly newerPageCount?: number;
  readonly pages: readonly DiffPage[];
  readonly elapsedMs?: number;
  readonly comparePagePair?: (request: {
    earlierPageIndex: number;
    newerPageIndex: number;
    signal: AbortSignal;
  }) => Promise<DiffPage>;
  readonly dispose?: () => void;
}

export interface ViewerAnalyticsEvent {
  name: "view_mode_used";
  mode: DiffViewMode;
}

export interface PdfDiffViewerProps {
  comparison: DiffComparison;
  processingProgress?: { readonly completed: number; readonly total: number };
  headerActions?: ReactNode;
  onNewComparison?: () => void;
  onAnalytics?: (event: ViewerAnalyticsEvent) => void;
}
