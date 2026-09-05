import type { ChangeClass, ChangeClassCounts, PageAlignmentKind, SemanticPageDiff } from "@pdfdiff/core";

export type { ChangeClass, ChangeClassCounts, PageAlignmentKind };
import type { ReactNode } from "react";

export type DiffViewMode = "diff" | "semantic-text" | "side-by-side" | "swipe";
export type SourceSide = "earlier" | "newer";
export type AlignmentMode = "none" | "translation";
export type DiffRegionKind = "added" | "removed" | "changed";
/** How finely the page on screen is rendered; "high" costs a re-render. */
export type RenderQuality = "standard" | "high";

/** Everything the settings dialog owns; none of it re-runs a comparison. */
export interface ViewerSettings {
  showBoundingBoxes: boolean;
  onlyChanged: boolean;
}

/** Presentation-only overlay appearance; changing it never re-runs a comparison. */
export interface OverlayStyle {
  addedColor: string;
  removedColor: string;
  modifiedColor: string;
  unchangedOpacity: number;
}

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
  /** Recolourable overlay layers; the compositor tints these live. */
  readonly layers?: { readonly base: string; readonly added: string; readonly removed: string; readonly modified: string };
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
    quality?: RenderQuality;
    signal: AbortSignal;
  }) => Promise<DiffPage>;
  readonly dispose?: () => void;
}

export interface PdfDiffViewerProps {
  comparison: DiffComparison;
  processingProgress?: { readonly completed: number; readonly total: number };
  headerActions?: ReactNode;
  onNewComparison?: () => void;
  /** Seeds the overlay controls; the viewer owns the live value from then on. */
  defaultOverlay?: OverlayStyle;
  onOverlayChange?: (overlay: OverlayStyle) => void;
  /** Page pairing mode; changing it re-runs the comparison, so the host owns it. */
  matchPages?: boolean;
  onMatchPagesChange?: (matchPages: boolean) => void;
}
