"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "../../components/ui/button";
import { FileDropzone } from "../../components/ui/file-dropzone";
import { ThemeToggle } from "../../components/ui/theme-toggle";
import { styles, styleProps, type TailwindClass } from "./styles";
import type { SemanticPageDiff } from "../../lib/pdfdiff/semantic";

/**
 * The UI deliberately depends on this small boundary instead of knowing how
 * PDF.js, workers, or a future WebGPU backend are wired. The parent can pass
 * an implementation from ../../lib/pdfdiff as `engine`.
 */
export type DiffViewMode =
  | "diff"
  | "semantic-text"
  | "side-by-side"
  | "swipe"
  | "blink"
  | "earlier"
  | "newer";

type SourceSide = "earlier" | "newer";

export type AlignmentMode = "none" | "translation";

export type DiffRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: "added" | "removed" | "changed";
  label?: string;
};

export type DiffTextChange = {
  id: string;
  text: string;
  kind: "added" | "removed" | "changed";
  beforeText?: string;
  afterText?: string;
  pageX?: number;
  pageY?: number;
};

export type DiffSemanticOverlay = {
  id: string;
  kind: "added" | "removed" | "changed";
  text: string;
  /** Four-point polygons normalized to the rendered page (0-100%). */
  quads: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>;
};

export type DiffPage = {
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
};

export type DiffComparison = {
  earlierName: string;
  newerName: string;
  pages: DiffPage[];
  elapsedMs?: number;
};

export type DiffOptions = {
  sensitivity: number;
  alignment: AlignmentMode;
};

export type PdfDiffEngine = {
  compare: (request: {
    earlier: File;
    newer: File;
    options: DiffOptions;
    signal: AbortSignal;
    onProgress?: (progress: { completed: number; total: number }) => void;
  }) => Promise<DiffComparison>;
};

export type PdfDiffAnalyticsEvent =
  | { name: "comparison_started"; earlierSizeBucket: string; newerSizeBucket: string }
  | { name: "comparison_completed"; pageCount: number; changedPageCount: number }
  | { name: "comparison_failed"; errorCode: string }
  | { name: "view_mode_used"; mode: DiffViewMode };

export type PdfDiffAppProps = {
  engine?: PdfDiffEngine;
  initialComparison?: DiffComparison;
  onAnalytics?: (event: PdfDiffAnalyticsEvent) => void;
};

const lazyBrowserEngine: PdfDiffEngine = {
  async compare(request) {
    const { browserPdfDiffEngine } = await import("../PdfDiffEngine");
    return browserPdfDiffEngine.compare(request);
  },
};

const MAX_FILE_SIZE = 150 * 1024 * 1024;
const viewModes: Array<{ id: DiffViewMode; label: string; shortcut: string }> = [
  { id: "diff", label: "Diff", shortcut: "1" },
  { id: "semantic-text", label: "Semantic text", shortcut: "2" },
  { id: "side-by-side", label: "Side by side", shortcut: "3" },
  { id: "swipe", label: "Swipe", shortcut: "4" },
  { id: "blink", label: "Blink", shortcut: "5" },
  { id: "earlier", label: "Earlier", shortcut: "6" },
  { id: "newer", label: "Newer", shortcut: "7" },
];

const zoomLevels = [50, 75, 100, 125, 150, 200] as const;


function sizeBucket(bytes: number): string {
  if (bytes < 2 * 1024 * 1024) return "small";
  if (bytes < 20 * 1024 * 1024) return "medium";
  if (bytes < 80 * 1024 * 1024) return "large";
  return "very_large";
}

function pageStatus(page: DiffPage): NonNullable<DiffPage["status"]> {
  if (page.status) return page.status;
  if (page.beforeSrc && page.afterSrc && page.diffSrc) return "changed";
  return "processing";
}

function statusSymbol(status: NonNullable<DiffPage["status"]>): string {
  if (status === "same") return "✓";
  if (status === "added") return "+";
  if (status === "removed") return "−";
  if (status === "error") return "!";
  return "•";
}

function statusLabel(status: NonNullable<DiffPage["status"]>): string {
  if (status === "same") return "No changes";
  if (status === "added") return "Added page";
  if (status === "removed") return "Removed page";
  if (status === "error") return "Error";
  if (status === "processing") return "Processing";
  return "Changes found";
}

function sourceForSide(page: DiffPage | null | undefined, side: SourceSide): string | undefined {
  return side === "earlier" ? page?.beforeSrc : page?.afterSrc;
}

function sourcePageCount(pages: ReadonlyArray<DiffPage>, side: SourceSide): number {
  return pages.reduce((lastPage, page, index) => sourceForSide(page, side) ? index + 1 : lastPage, 0);
}

function clampPageIndex(index: number, pageCount: number): number {
  return Math.min(Math.max(0, index), Math.max(0, pageCount - 1));
}

function zoomStyle(zoom: number) {
  return styles[`paperZoom${zoom}` as keyof typeof styles] as TailwindClass;
}

function swipeStyle(value: number) {
  const rounded = Math.min(100, Math.max(0, Math.round(value / 10) * 10));
  return styles[`swipe${rounded}` as keyof typeof styles] as TailwindClass;
}

function getRegionStyle(region: DiffRegion): CSSProperties {
  const x = `${Math.max(0, Math.min(100, region.x))}%`;
  const y = `${Math.max(0, Math.min(100, region.y))}%`;
  const width = `${Math.max(0.5, Math.min(100, region.width))}%`;
  const height = `${Math.max(0.5, Math.min(100, region.height))}%`;
  // These CSS custom properties are intentionally the only dynamic visual
  // values; the containing visual treatment remains a Tailwind class.
  return { left: x, top: y, width, height };
}

function ThumbPlaceholder() {
  return (
    <div {...styleProps(styles.thumbPlaceholder)} aria-hidden="true">
      <span {...styleProps(styles.thumbLine)} />
      <span {...styleProps(styles.thumbLine, styles.thumbLineShort)} />
      <span {...styleProps(styles.thumbDiagram)} />
      <span {...styleProps(styles.thumbLine, styles.thumbLineShort)} />
    </div>
  );
}

function PaperFallback({ label }: { label: string }) {
  return (
    <div {...styleProps(styles.paperEmpty)}>
      <div>
        <span {...styleProps(styles.placeholderTitle)} aria-hidden="true" />
        <p>{label}</p>
      </div>
    </div>
  );
}

function semanticPolygonPoints(quad: ReadonlyArray<{ x: number; y: number }>): string {
  return quad.map((point) => `${point.x},${point.y}`).join(" ");
}

function SemanticNativePane({
  side,
  source,
  overlays,
  selectedRegion,
  showHighlights,
  onSelectChange,
}: {
  side: SourceSide;
  source?: string;
  overlays: readonly DiffSemanticOverlay[];
  selectedRegion: string | null;
  showHighlights: boolean;
  onSelectChange: (id: string) => void;
}) {
  const label = side === "earlier" ? "Earlier" : "Newer";
  return (
    <article {...styleProps(styles.semanticColumn)} aria-label={`${label} native PDF page`}>
      <header {...styleProps(styles.semanticHeader)}>
        <span>{label}</span>
        <span>{overlays.length ? `${overlays.length} changes` : "Native page"}</span>
      </header>
      <div {...styleProps(styles.semanticViewport)}>
        {source ? <img {...styleProps(styles.semanticPageImage)} src={source} alt={`${label} version of this page`} draggable={false} /> : <PaperFallback label={`No ${label.toLowerCase()} page`} />}
        {source && showHighlights && overlays.length ? (
          <svg
            {...styleProps(styles.semanticOverlay)}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-label={`${label} semantic text changes`}
          >
            {overlays.flatMap((overlay) => overlay.quads.map((quad, index) => (
              <polygon
                key={`${overlay.id}-${index}`}
                {...styleProps(
                  styles.semanticOverlayPolygon,
                  overlay.kind === "added" && styles.semanticOverlayAdded,
                  overlay.kind === "removed" && styles.semanticOverlayRemoved,
                  overlay.kind === "changed" && styles.semanticOverlayChanged,
                  selectedRegion === overlay.id && styles.semanticOverlayCurrent,
                )}
                points={semanticPolygonPoints(quad)}
                data-semantic-change-id={overlay.id}
                role="button"
                tabIndex={0}
                aria-label={`${overlay.kind} text: ${overlay.text}`}
                onClick={() => onSelectChange(overlay.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectChange(overlay.id);
                  }
                }}
              >
                <title>{overlay.text}</title>
              </polygon>
            )))}
          </svg>
        ) : null}
      </div>
    </article>
  );
}

function SemanticPdfPreview({
  page,
  zoom,
  selectedRegion,
  showHighlights,
  onSelectChange,
}: {
  page: DiffPage;
  zoom: number;
  selectedRegion: string | null;
  showHighlights: boolean;
  onSelectChange: (id: string) => void;
}) {
  const semantic = page.semantic;
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedRegion || !showHighlights) return;
    const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(selectedRegion) : selectedRegion.replace(/"/g, '\\"');
    const target = previewRef.current?.querySelector<SVGPolygonElement>(`[data-semantic-change-id="${escapedId}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [selectedRegion, showHighlights]);

  return (
    <div ref={previewRef} {...styleProps(styles.paper, styles.semanticPaper, zoomStyle(zoom))}>
      <div {...styleProps(styles.semanticSummary)}>
        <span>{semantic?.changes.length ? `${semantic.changes.length} text change${semantic.changes.length === 1 ? "" : "s"}` : "No semantic text changes"}</span>
        <span>{semantic ? `${semantic.beforeTokenCount} → ${semantic.afterTokenCount} tokens` : "Native PDF rendering"}</span>
      </div>
      <div {...styleProps(styles.semanticLegend)}>
        <span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendRemoved)} />Removed</span>
        <span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendAdded)} />Added</span>
        <span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendChanged)} />Changed</span>
        <span {...styleProps(styles.semanticLegendNote)}>Original PDF rendering · anchored highlights</span>
      </div>
      <div {...styleProps(styles.semanticGrid)}>
        <SemanticNativePane
          side="earlier"
          source={page.beforeSrc}
          overlays={page.semanticBeforeOverlays ?? []}
          selectedRegion={selectedRegion}
          showHighlights={showHighlights}
          onSelectChange={onSelectChange}
        />
        <SemanticNativePane
          side="newer"
          source={page.afterSrc}
          overlays={page.semanticAfterOverlays ?? []}
          selectedRegion={selectedRegion}
          showHighlights={showHighlights}
          onSelectChange={onSelectChange}
        />
      </div>
      {semantic && !semantic.hasBeforeText && !semantic.hasAfterText ? (
        <div {...styleProps(styles.semanticNoText)}>
          <strong>No selectable text found</strong>
          <span>The native pages remain available; run OCR to calculate semantic text changes.</span>
        </div>
      ) : null}
    </div>
  );
}

function PagePreview({
  page,
  mode,
  zoom,
  swipe,
  blinkOn,
  showBoundingBoxes,
  showSemanticHighlights,
  selectedRegion,
  onRegionClick,
  onSelectChange,
  onSwipeChange,
}: {
  page: DiffPage;
  mode: DiffViewMode;
  zoom: number;
  swipe: number;
  blinkOn: boolean;
  showBoundingBoxes: boolean;
  showSemanticHighlights: boolean;
  selectedRegion: string | null;
  onRegionClick: (region: DiffRegion) => void;
  onSelectChange: (id: string) => void;
  onSwipeChange: (value: number) => void;
}) {
  const before = page.beforeSrc;
  const after = page.afterSrc;
  const diff = page.diffSrc;
  const canShowImages = Boolean(before || after || diff);
  const renderImage = (source: string | undefined, alt: string, imageStyle: TailwindClass = styles.pageImage) =>
    source ? <img {...styleProps(imageStyle)} src={source} alt={alt} draggable={false} /> : <PaperFallback label="Preview is still rendering" />;

  if (mode === "semantic-text") {
    return <SemanticPdfPreview page={page} zoom={zoom} selectedRegion={selectedRegion} showHighlights={showSemanticHighlights} onSelectChange={onSelectChange} />;
  }

  const overlays = showBoundingBoxes && mode === "diff" && page.regions?.length ? (
    <>
      {page.regions.map((region) => (
        <button
          key={region.id}
          type="button"
          aria-label={region.label ?? `${region.kind ?? "changed"} region`}
          title={region.label}
          {...styleProps(
            styles.changeOverlay,
            region.kind === "added" && styles.changeOverlayAdded,
            region.kind === "removed" && styles.changeOverlayRemoved,
            selectedRegion === region.id && styles.changeOverlayCurrent,
          )}
          onClick={() => onRegionClick(region)}
          style={getRegionStyle(region)}
        />
      ))}
    </>
  ) : null;

  const setSwipeFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const paper = event.currentTarget.parentElement;
    if (!paper) return;
    const bounds = paper.getBoundingClientRect();
    const value = ((event.clientX - bounds.left) / bounds.width) * 100;
    onSwipeChange(Math.round(Math.max(0, Math.min(100, value))));
  };

  const handleSwipePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSwipeFromPointer(event);
  };

  const handleSwipePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.preventDefault();
      setSwipeFromPointer(event);
    }
  };

  const handleSwipePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleSwipeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onSwipeChange(Math.max(0, swipe - step));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onSwipeChange(Math.min(100, swipe + step));
    } else if (event.key === "Home") {
      event.preventDefault();
      onSwipeChange(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onSwipeChange(100);
    }
  };

  if (!canShowImages) {
    return <div {...styleProps(styles.paper, zoomStyle(zoom))}><PaperFallback label={statusLabel(pageStatus(page))} /></div>;
  }

  if (mode === "side-by-side") {
    return (
      <div {...styleProps(styles.paper, zoomStyle(zoom))}>
        <div {...styleProps(styles.sideBySide)}>
          <div {...styleProps(styles.sidePanel)}>{renderImage(before, "Earlier version of this page")}</div>
          <div {...styleProps(styles.sidePanel)}>{renderImage(after, "Newer version of this page")}</div>
        </div>
      </div>
    );
  }

  if (mode === "swipe") {
    return (
      <div {...styleProps(styles.paper, styles.swipeWrap, zoomStyle(zoom))}>
        {renderImage(before, "Earlier version of this page")}
        {after ? <img {...styleProps(styles.swipeNewer, swipeStyle(swipe))} src={after} alt="Newer version of this page" draggable={false} /> : null}
        <div
          {...styleProps(styles.swipeHandle)}
          style={{ left: `${swipe}%` }}
          role="slider"
          aria-label="Swipe position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={swipe}
          aria-valuetext={`${swipe}%`}
          tabIndex={0}
          onKeyDown={handleSwipeKeyDown}
          onPointerDown={handleSwipePointerDown}
          onPointerMove={handleSwipePointerMove}
          onPointerUp={handleSwipePointerEnd}
          onPointerCancel={handleSwipePointerEnd}
        >
          <span {...styleProps(styles.swipeDivider)} aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (mode === "blink") {
    return (
      <div {...styleProps(styles.paper, zoomStyle(zoom))}>
        {renderImage(blinkOn ? after : before, blinkOn ? "Newer version of this page" : "Earlier version of this page")}
        <span {...styleProps(styles.blinkBadge)}>{blinkOn ? "Newer" : "Earlier"}</span>
      </div>
    );
  }

  if (mode === "earlier") return <div {...styleProps(styles.paper, zoomStyle(zoom))}>{renderImage(before, "Earlier version of this page")}</div>;
  if (mode === "newer") return <div {...styleProps(styles.paper, zoomStyle(zoom))}>{renderImage(after, "Newer version of this page")}</div>;

  return (
    <div {...styleProps(styles.paper, zoomStyle(zoom))}>
      {diff ? renderImage(diff, "Visual diff of this page", styles.diffImage) : renderImage(before, "Earlier version of this page")}
      {!diff && page.status === "changed" ? (
        <div {...styleProps(styles.canvasCaption)}>
          <span {...styleProps(styles.captionDotAdded)} aria-hidden="true" />
          <span>Added</span>
          <span {...styleProps(styles.captionDotRemoved)} aria-hidden="true" />
          <span>Removed</span>
        </div>
      ) : null}
      {overlays}
    </div>
  );
}

function FullPageViewer({
  page,
  pageNumber,
  pageCount,
  earlierName,
  newerName,
  side,
  onSideChange,
  onPageChange,
  onClose,
}: {
  page: DiffPage;
  pageNumber: number;
  pageCount: number;
  earlierName: string;
  newerName: string;
  side: SourceSide;
  onSideChange: (side: SourceSide) => void;
  onPageChange: (side: SourceSide, index: number) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const source = sourceForSide(page, side);
  const earlierSource = sourceForSide(page, "earlier");
  const newerSource = sourceForSide(page, "newer");
  const fileName = side === "earlier" ? earlierName : newerName;
  const sourceLabel = side === "earlier" ? "Earlier" : "Newer";
  const sourceModifier = side === "earlier" ? "Shift" : "Ctrl/Cmd";

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  if (!source) return null;

  return (
    <div
      {...styleProps(styles.fullPageBackdrop)}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        {...styleProps(styles.fullPageDialog)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="full-page-viewer-title"
      >
        <header {...styleProps(styles.fullPageToolbar)}>
          <div {...styleProps(styles.fullPageHeading)}>
            <h2 id="full-page-viewer-title" {...styleProps(styles.fullPageTitle)}>{sourceLabel} page {pageNumber}</h2>
            <p {...styleProps(styles.fullPageFileName)} title={fileName}>{fileName}</p>
          </div>
          <div {...styleProps(styles.fullPageActions)}>
            <div {...styleProps(styles.sourceGroup)} role="group" aria-label="Source page">
              <button
                {...styleProps(styles.sourceButton, side === "earlier" && styles.sourceButtonCurrent)}
                type="button"
                aria-pressed={side === "earlier"}
                disabled={!earlierSource}
                onClick={() => onSideChange("earlier")}
              >Earlier</button>
              <button
                {...styleProps(styles.sourceButton, side === "newer" && styles.sourceButtonCurrent)}
                type="button"
                aria-pressed={side === "newer"}
                disabled={!newerSource}
                onClick={() => onSideChange("newer")}
              >Newer</button>
            </div>
            <div {...styleProps(styles.fullPagePageNav)} aria-label={`${sourceLabel} page navigation`}>
              <button
                {...styleProps(styles.iconButton)}
                type="button"
                aria-label={`Previous ${sourceLabel.toLowerCase()} page`}
                title={`Previous ${sourceLabel.toLowerCase()} page (${sourceModifier} + ←)`}
                disabled={pageNumber <= 1}
                onClick={() => onPageChange(side, pageNumber - 2)}
              >←</button>
              <span {...styleProps(styles.fullPagePagePosition)}>Page {pageNumber} / {pageCount}</span>
              <button
                {...styleProps(styles.iconButton)}
                type="button"
                aria-label={`Next ${sourceLabel.toLowerCase()} page`}
                title={`Next ${sourceLabel.toLowerCase()} page (${sourceModifier} + →)`}
                disabled={pageNumber >= pageCount}
                onClick={() => onPageChange(side, pageNumber)}
              >→</button>
            </div>
            <button
              ref={closeButtonRef}
              {...styleProps(styles.iconButton, styles.fullPageClose)}
              type="button"
              aria-label="Close full-page view"
              title="Close full-page view (Escape)"
              onClick={onClose}
            >×</button>
          </div>
        </header>
        <div {...styleProps(styles.fullPageStage)}>
          <img
            {...styleProps(styles.fullPageImage)}
            src={source}
            alt={`${sourceLabel} version of page ${pageNumber}`}
            draggable={false}
          />
        </div>
        <footer {...styleProps(styles.fullPageFooter)}>
          <span>Full-page view</span>
          <span>Shift + ← → Earlier · Ctrl/Cmd + ← → Newer · Esc to close</span>
        </footer>
      </section>
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      {...styleProps(styles.fullPageBackdrop)}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        {...styleProps(styles.helpDialog)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        aria-describedby="help-dialog-lead"
      >
        <header {...styleProps(styles.helpHeader)}>
          <div>
            <p {...styleProps(styles.helpEyebrow)}>PDF Diff guide</p>
            <h2 id="help-dialog-title" {...styleProps(styles.helpTitle)}>How to compare PDFs</h2>
            <p id="help-dialog-lead" {...styleProps(styles.helpLead)}>A quick guide to the workflow, review tools, and keyboard shortcuts.</p>
          </div>
          <button
            ref={closeButtonRef}
            {...styleProps(styles.iconButton, styles.helpClose)}
            type="button"
            aria-label="Close help"
            title="Close help (Escape)"
            onClick={onClose}
          >×</button>
        </header>
        <div {...styleProps(styles.helpBody)}>
          <section {...styleProps(styles.helpSection)} aria-labelledby="help-start-heading">
            <h3 id="help-start-heading" {...styleProps(styles.helpSectionTitle)}>Start here</h3>
            <ol {...styleProps(styles.helpSteps)}>
              <li {...styleProps(styles.helpStep)}>
                <span {...styleProps(styles.howToStep)}>1</span>
                <h4 {...styleProps(styles.helpStepTitle)}>Add both versions</h4>
                <p {...styleProps(styles.helpStepCopy)}>Put the original in Earlier and the revision in Newer. Drop files or browse; both can be selected from either picker.</p>
              </li>
              <li {...styleProps(styles.helpStep)}>
                <span {...styleProps(styles.howToStep)}>2</span>
                <h4 {...styleProps(styles.helpStepTitle)}>Compare the pair</h4>
                <p {...styleProps(styles.helpStepCopy)}>Select Compare PDFs. Pages are rendered, pixels are compared, and extracted text is diffed in your browser.</p>
              </li>
              <li {...styleProps(styles.helpStep)}>
                <span {...styleProps(styles.howToStep)}>3</span>
                <h4 {...styleProps(styles.helpStepTitle)}>Review what moved</h4>
                <p {...styleProps(styles.helpStepCopy)}>Use the page rail, diff views, bounding boxes, text changes, and Next changed page to inspect the result.</p>
              </li>
            </ol>
          </section>

          <section {...styleProps(styles.helpSection)} aria-labelledby="help-review-heading">
            <h3 id="help-review-heading" {...styleProps(styles.helpSectionTitle)}>Review tools</h3>
            <div {...styleProps(styles.helpFeatureGrid)}>
              <div {...styleProps(styles.helpFeature)}><strong {...styleProps(styles.helpFeatureTitle)}>Page status</strong><p {...styleProps(styles.helpFeatureCopy)}>✓ means no changes; a dot means changes found; + and − identify added and removed pages.</p></div>
              <div {...styleProps(styles.helpFeature)}><strong {...styleProps(styles.helpFeatureTitle)}>Change inspector</strong><p {...styleProps(styles.helpFeatureCopy)}>See changed pages, changed area, detected regions, and extracted text changes for the current page.</p></div>
              <div {...styleProps(styles.helpFeature)}><strong {...styleProps(styles.helpFeatureTitle)}>Full-page view</strong><p {...styleProps(styles.helpFeatureCopy)}>Open the Earlier or Newer source page larger, then move through that source with the page controls.</p></div>
              <div {...styleProps(styles.helpFeature)}><strong {...styleProps(styles.helpFeatureTitle)}>Zoom and alignment</strong><p {...styleProps(styles.helpFeatureCopy)}>Zoom from 50% to 200%. Translation-only alignment helps account for small page shifts.</p></div>
            </div>
          </section>

          <section {...styleProps(styles.helpSection)} aria-labelledby="help-modes-heading">
            <h3 id="help-modes-heading" {...styleProps(styles.helpSectionTitle)}>View modes</h3>
            <div {...styleProps(styles.helpModeList)}>
              <p {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>Semantic text</strong> — native PDF pages with word-level highlights anchored to their source geometry.</p>
              <p {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>Diff</strong> — visual change overlay.</p>
              <p {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>Side by side</strong> — Earlier and Newer next to each other.</p>
              <p {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>Swipe</strong> — drag the divider across the page.</p>
              <p {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>Blink</strong> — alternate between versions automatically.</p>
              <p {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>Earlier / Newer</strong> — inspect one source on its own.</p>
            </div>
          </section>

          <section {...styleProps(styles.helpSection)} aria-labelledby="help-shortcuts-heading">
            <h3 id="help-shortcuts-heading" {...styleProps(styles.helpSectionTitle)}>Keyboard shortcuts</h3>
            <div {...styleProps(styles.helpShortcutGrid)}>
              <p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>← →</kbd><span>Move through comparison pages.</span></p>
              <p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>1–7</kbd><span>Choose a view mode.</span></p>
              <p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>J / N</kbd><span>Next page; K / P goes back.</span></p>
              <p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>M</kbd><span>Cycle modes; Shift + M cycles backward.</span></p>
              <p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>Shift + ← →</kbd><span>Move through Earlier source pages.</span></p>
              <p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>Ctrl/Cmd + ← →</kbd><span>Move through Newer source pages.</span></p>
              <p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>Home / End</kbd><span>Jump to the first or last page.</span></p>
              <p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>Esc</kbd><span>Close full-page view or clear a selection.</span></p>
            </div>
          </section>

          <p {...styleProps(styles.helpNote)}><strong>Local by design.</strong> Your PDFs stay on this device and are processed in the browser. Semantic text comparison needs a selectable text layer; OCR scanned PDFs first. PDF files must be under 150 MB each.</p>
        </div>
        <footer {...styleProps(styles.helpFooter)}>
          <span>Settings apply when a comparison starts.</span>
          <Button variant="outline" size="sm" onClick={onClose}>Back to app</Button>
        </footer>
      </section>
    </div>
  );
}

function normalizeFile(file: File | undefined): File | null {
  if (!file) return null;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return file;
  return null;
}

export default function PdfDiffApp({ engine, initialComparison, onAnalytics }: PdfDiffAppProps) {
  const activeEngine = engine ?? lazyBrowserEngine;
  const [earlierFile, setEarlierFile] = useState<File | null>(null);
  const [newerFile, setNewerFile] = useState<File | null>(null);
  const [comparison, setComparison] = useState<DiffComparison | null>(initialComparison ?? null);
  const [phase, setPhase] = useState<"upload" | "loading" | "workspace">(initialComparison ? "workspace" : "upload");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeDrop, setActiveDrop] = useState<"earlier" | "newer" | null>(null);
  const [mode, setMode] = useState<DiffViewMode>("diff");
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState<number>(100);
  const [swipe, setSwipe] = useState(50);
  const [sensitivity, setSensitivity] = useState(28);
  const [alignment, setAlignment] = useState<AlignmentMode>("none");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [showSemanticHighlights, setShowSemanticHighlights] = useState(true);
  const [blinkOn, setBlinkOn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [fullPageSide, setFullPageSide] = useState<SourceSide | null>(null);
  const [earlierPageIndex, setEarlierPageIndex] = useState(0);
  const [newerPageIndex, setNewerPageIndex] = useState(0);
  const inputEarlier = useRef<HTMLInputElement>(null);
  const inputNewer = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const closeHelp = useCallback(() => setShowHelp(false), []);

  const pages = useMemo(() => comparison?.pages ?? [], [comparison]);
  const currentPage = pages[pageIndex] ?? null;
  const changedPages = useMemo(() => pages.filter((page) => pageStatus(page) !== "same"), [pages]);
  const currentRegions = currentPage?.regions ?? [];
  const currentTextChanges = currentPage?.textChanges ?? [];
  const changedPercent = currentPage?.changedPercent ?? 0;
  const earlierPageCount = useMemo(() => sourcePageCount(pages, "earlier"), [pages]);
  const newerPageCount = useMemo(() => sourcePageCount(pages, "newer"), [pages]);
  const earlierPage = pages[earlierPageIndex] ?? null;
  const newerPage = pages[newerPageIndex] ?? null;
  const fullPageIndex = fullPageSide === "earlier" ? earlierPageIndex : newerPageIndex;
  const fullPage = fullPageSide === "earlier" ? earlierPage : newerPage;
  const fullPageCount = fullPageSide === "earlier" ? earlierPageCount : newerPageCount;

  const selectPage = useCallback((index: number) => {
    const nextIndex = clampPageIndex(index, pages.length);
    setPageIndex(nextIndex);
    setEarlierPageIndex(clampPageIndex(nextIndex, earlierPageCount));
    setNewerPageIndex(clampPageIndex(nextIndex, newerPageCount));
    setSelectedRegion(null);
    setFullPageSide((side) => {
      if (!side) return null;
      const nextPage = pages[nextIndex];
      if (!nextPage || sourceForSide(nextPage, side)) return side;
      const alternateSide = side === "earlier" ? "newer" : "earlier";
      return sourceForSide(nextPage, alternateSide) ? alternateSide : null;
    });
  }, [earlierPageCount, newerPageCount, pages]);

  const goToSourcePage = useCallback((side: SourceSide, index: number) => {
    const pageCount = side === "earlier" ? earlierPageCount : newerPageCount;
    const nextIndex = clampPageIndex(index, pageCount);
    if (side === "earlier") setEarlierPageIndex(nextIndex);
    else setNewerPageIndex(nextIndex);
    if (fullPageSide) setFullPageSide(side);
  }, [earlierPageCount, fullPageSide, newerPageCount]);

  const stepSourcePage = useCallback((side: SourceSide, direction: 1 | -1) => {
    if (side === "earlier") setEarlierPageIndex((index) => clampPageIndex(index + direction, earlierPageCount));
    else setNewerPageIndex((index) => clampPageIndex(index + direction, newerPageCount));
    if (fullPageSide) setFullPageSide(side);
  }, [earlierPageCount, fullPageSide, newerPageCount]);

  const changeMode = useCallback((nextMode: DiffViewMode) => {
    setMode(nextMode);
    onAnalytics?.({ name: "view_mode_used", mode: nextMode });
  }, [onAnalytics]);

  const cycleMode = useCallback((direction: 1 | -1) => {
    const currentModeIndex = viewModes.findIndex((item) => item.id === mode);
    const nextModeIndex = (currentModeIndex + direction + viewModes.length) % viewModes.length;
    changeMode(viewModes[nextModeIndex]!.id);
  }, [changeMode, mode]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (mode !== "blink") return;
    const timer = window.setInterval(() => setBlinkOn((value) => !value), 720);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (!fullPageSide) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullPageSide]);

  useEffect(() => {
    if (phase !== "workspace") return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.isContentEditable) return;
      if (event.key === "Escape" && fullPageSide) {
        event.preventDefault();
        setFullPageSide(null);
        return;
      }
      if (target?.getAttribute("role") === "slider") return;
      const isNextPageKey = event.key === "ArrowRight" || event.key === "PageDown" || event.key.toLowerCase() === "j" || event.key.toLowerCase() === "n";
      const isPreviousPageKey = event.key === "ArrowLeft" || event.key === "PageUp" || event.key.toLowerCase() === "k" || event.key.toLowerCase() === "p";
      const pageDirection = isNextPageKey ? 1 : isPreviousPageKey ? -1 : 0;
      if (pageDirection) {
        event.preventDefault();
        const sourceSide = event.shiftKey ? "earlier" : event.ctrlKey || event.metaKey ? "newer" : fullPageSide;
        if (sourceSide) stepSourcePage(sourceSide, pageDirection);
        else selectPage(pageIndex + pageDirection);
        return;
      }
      const numberMode = viewModes.find((item) => item.shortcut === event.key);
      if (numberMode) {
        event.preventDefault();
        changeMode(numberMode.id);
      } else if (event.key === "[" || event.key === "{") {
        event.preventDefault();
        cycleMode(-1);
      } else if (event.key === "]" || event.key === "}") {
        event.preventDefault();
        cycleMode(1);
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        cycleMode(event.shiftKey ? -1 : 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        const sourceSide = event.shiftKey ? "earlier" : event.ctrlKey || event.metaKey ? "newer" : fullPageSide;
        if (sourceSide) goToSourcePage(sourceSide, 0);
        else selectPage(0);
      } else if (event.key === "End") {
        event.preventDefault();
        const sourceSide = event.shiftKey ? "earlier" : event.ctrlKey || event.metaKey ? "newer" : fullPageSide;
        if (sourceSide) goToSourcePage(sourceSide, sourceSide === "earlier" ? earlierPageCount - 1 : newerPageCount - 1);
        else selectPage(pages.length - 1);
      } else if (event.key === "Escape") {
        setSelectedRegion(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeMode, cycleMode, earlierPageCount, fullPageSide, goToSourcePage, newerPageCount, pageIndex, pages.length, phase, selectPage, stepSourcePage]);

  const setFile = useCallback((side: "earlier" | "newer", file: File | null) => {
    if (side === "earlier") setEarlierFile(file);
    else setNewerFile(file);
    setError(null);
    setComparison(null);
    setPhase("upload");
    setPageIndex(0);
    setFullPageSide(null);
    setEarlierPageIndex(0);
    setNewerPageIndex(0);
  }, []);

  const chooseFile = (side: "earlier" | "newer") => {
    if (side === "earlier") inputEarlier.current?.click();
    else inputNewer.current?.click();
  };

  const handleInput = (side: "earlier" | "newer", event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) {
      event.target.value = "";
      return;
    }

    if (selectedFiles.length > 2 || selectedFiles.some((file) => !normalizeFile(file))) {
      setError("Choose one or two PDF files.");
      event.target.value = "";
      return;
    }

    const files = selectedFiles.map((file) => normalizeFile(file) as File);
    if (files.some((file) => file.size > MAX_FILE_SIZE)) {
      setError("That PDF exceeds the 150 MB limit. Choose a smaller file.");
      event.target.value = "";
      return;
    }

    setFile(side, files[0]);
    if (files[1]) {
      setFile(side === "earlier" ? "newer" : "earlier", files[1]);
    }
    event.target.value = "";
  };

  const handleDrop = (side: "earlier" | "newer", event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setActiveDrop(null);
    const file = normalizeFile(event.dataTransfer.files?.[0]);
    if (!file) {
      setError("Drop a PDF file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("That PDF exceeds the 150 MB limit. Choose a smaller file.");
      return;
    }
    setFile(side, file);
  };

  const swapFiles = () => {
    setEarlierFile(newerFile);
    setNewerFile(earlierFile);
    if (comparison) {
      setComparison({ ...comparison, earlierName: comparison.newerName, newerName: comparison.earlierName });
    }
  };

  const runComparison = async () => {
    if (!earlierFile || !newerFile) return;
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setError(null);
    setPhase("loading");
    setProgress(0);
    onAnalytics?.({ name: "comparison_started", earlierSizeBucket: sizeBucket(earlierFile.size), newerSizeBucket: sizeBucket(newerFile.size) });

    try {
      const result = await activeEngine.compare({
        earlier: earlierFile,
        newer: newerFile,
        options: { sensitivity, alignment },
        signal: abortController.signal,
        onProgress: ({ completed, total }) => setProgress(total ? Math.round((completed / total) * 100) : 0),
      });
      if (abortController.signal.aborted) return;
      setComparison(result);
      setPageIndex(0);
      setSelectedRegion(null);
      setFullPageSide(null);
      setEarlierPageIndex(0);
      setNewerPageIndex(0);
      setPhase("workspace");
      setProgress(100);
      onAnalytics?.({ name: "comparison_completed", pageCount: result.pages.length, changedPageCount: result.pages.filter((page) => pageStatus(page) !== "same").length });
    } catch (comparisonError) {
      if (abortController.signal.aborted) return;
      const message = comparisonError instanceof Error ? comparisonError.message : "Unable to compare these PDFs.";
      setError(message);
      setPhase("upload");
      onAnalytics?.({ name: "comparison_failed", errorCode: "compare_failed" });
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setEarlierFile(null);
    setNewerFile(null);
    setComparison(null);
    setError(null);
    setPhase("upload");
    setProgress(0);
    setPageIndex(0);
    setSelectedRegion(null);
    setFullPageSide(null);
    setEarlierPageIndex(0);
    setNewerPageIndex(0);
  };

  const openFullPage = (side: SourceSide) => {
    if (sourceForSide(side === "earlier" ? earlierPage : newerPage, side)) setFullPageSide(side);
  };

  const selectRegion = (region: DiffRegion) => setSelectedRegion(region.id);

  const goToNextChange = () => {
    if (!pages.length) return;
    const next = pages.findIndex((page, index) => index > pageIndex && pageStatus(page) !== "same");
    const fallback = pages.findIndex((page) => pageStatus(page) !== "same");
    selectPage(next >= 0 ? next : fallback >= 0 ? fallback : pageIndex);
  };

  if (phase === "upload") {
    return (
      <main {...styleProps(styles.root)}>
        <div {...styleProps(styles.shell)}>
          <header {...styleProps(styles.topbar)}>
            <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
            <div {...styleProps(styles.topbarActions)}>
              <div {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> Files stay on your device</div>
              <button {...styleProps(styles.helpButton)} type="button" aria-haspopup="dialog" onClick={() => setShowHelp(true)}><span {...styleProps(styles.helpButtonMark)} aria-hidden="true">?</span> How it works</button>
              <ThemeToggle />
            </div>
          </header>
          <section {...styleProps(styles.intro)} aria-labelledby="upload-heading">
            <p {...styleProps(styles.eyebrow)}>PDF comparison</p>
            <h1 id="upload-heading" {...styleProps(styles.headline)}>Compare PDFs.<br /><em {...styleProps(styles.headlineAccent)}>Spot the difference.</em></h1>
            <p {...styleProps(styles.introCopy)}>Drop two versions to review what changed, page by page. Or select both PDFs from either picker; the first fills the card you opened.</p>
            <div {...styleProps(styles.uploadGrid)}>
              <FileDropzone label="Earlier" description="Original PDF" file={earlierFile} active={activeDrop === "earlier"} onChoose={() => chooseFile("earlier")} onRemove={() => setFile("earlier", null)} onActive={(active) => setActiveDrop(active ? "earlier" : null)} onDrop={(event) => handleDrop("earlier", event)} />
              <button {...styleProps(styles.swapUpload)} type="button" aria-label="Swap earlier and newer files" onClick={swapFiles}>↔</button>
              <FileDropzone label="Newer" description="Revised PDF" file={newerFile} active={activeDrop === "newer"} onChoose={() => chooseFile("newer")} onRemove={() => setFile("newer", null)} onActive={(active) => setActiveDrop(active ? "newer" : null)} onDrop={(event) => handleDrop("newer", event)} />
            </div>
            <input ref={inputEarlier} {...styleProps(styles.srOnly)} type="file" multiple accept="application/pdf,.pdf" aria-label="Choose one or two PDFs for earlier and newer" onChange={(event) => handleInput("earlier", event)} />
            <input ref={inputNewer} {...styleProps(styles.srOnly)} type="file" multiple accept="application/pdf,.pdf" aria-label="Choose one or two PDFs for newer and earlier" onChange={(event) => handleInput("newer", event)} />
            <Button size="lg" className={styles.compareButton} disabled={!earlierFile || !newerFile} onClick={() => void runComparison()}>Compare PDFs <span aria-hidden="true">→</span></Button>
            {error ? <div {...styleProps(styles.errorBox)} role="alert">{error}</div> : null}
            <section {...styleProps(styles.howTo)} aria-labelledby="how-to-heading">
              <div {...styleProps(styles.howToHeader)}>
                <p {...styleProps(styles.eyebrow)}>How it works</p>
                <h2 id="how-to-heading" {...styleProps(styles.howToTitle)}>A clear path from revision to review.</h2>
                <p {...styleProps(styles.howToCopy)}>PDF Diff turns two versions into a focused review workspace. Everything happens locally, so you can move from upload to evidence without sending the documents anywhere.</p>
              </div>
              <div {...styleProps(styles.howToGrid)}>
                <article {...styleProps(styles.howToCard)}><span {...styleProps(styles.howToStep)}>1</span><h3 {...styleProps(styles.howToCardTitle)}>Load both versions</h3><p {...styleProps(styles.howToCardCopy)}>Add the original to Earlier and the revision to Newer. Drop files or browse, then swap them if needed.</p></article>
                <article {...styleProps(styles.howToCard)}><span {...styleProps(styles.howToStep)}>2</span><h3 {...styleProps(styles.howToCardTitle)}>Compare page by page</h3><p {...styleProps(styles.howToCardCopy)}>The browser renders each page, finds visual differences, and checks the extracted text.</p></article>
                <article {...styleProps(styles.howToCard)}><span {...styleProps(styles.howToStep)}>3</span><h3 {...styleProps(styles.howToCardTitle)}>Inspect the evidence</h3><p {...styleProps(styles.howToCardCopy)}>Switch views, zoom in, select regions, and use Next changed page to work through the review.</p></article>
              </div>
              <div {...styleProps(styles.featureGrid)}>
                <div {...styleProps(styles.featureCard)}><strong {...styleProps(styles.featureTitle)}>Local by design</strong><p {...styleProps(styles.featureCopy)}>PDFs stay on this device while they are processed.</p></div>
                <div {...styleProps(styles.featureCard)}><strong {...styleProps(styles.featureTitle)}>Seven ways to compare</strong><p {...styleProps(styles.featureCopy)}>Semantic text, diff, side by side, swipe, blink, Earlier, and Newer.</p></div>
                <div {...styleProps(styles.featureCard)}><strong {...styleProps(styles.featureTitle)}>Review-ready detail</strong><p {...styleProps(styles.featureCopy)}>Page status, change regions, text changes, and full-page views.</p></div>
              </div>
            </section>
          </section>
          {showHelp ? <HelpDialog onClose={closeHelp} /> : null}
        </div>
      </main>
    );
  }

  if (phase === "loading") {
    return (
      <main {...styleProps(styles.root)}>
        <div {...styleProps(styles.shell)}>
          <header {...styleProps(styles.topbar)}>
            <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
            <div {...styleProps(styles.topbarActions)}>
              <div {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> Processing</div>
              <button {...styleProps(styles.helpButton)} type="button" aria-haspopup="dialog" onClick={() => setShowHelp(true)}><span {...styleProps(styles.helpButtonMark)} aria-hidden="true">?</span> How it works</button>
              <ThemeToggle />
            </div>
          </header>
          <section {...styleProps(styles.loading)} aria-live="polite" aria-busy="true">
            <div {...styleProps(styles.loadingCard)}>
              <div {...styleProps(styles.loadingMark)} aria-hidden="true">◐</div>
              <h1 {...styleProps(styles.loadingTitle)}>Comparing your PDFs</h1>
              <p {...styleProps(styles.loadingCopy)}>Rendering pages and finding changes.</p>
              <div {...styleProps(styles.progressTrack)}><div {...styleProps(styles.progressFill)} style={{ width: `${progress}%` }} /></div>
              <p {...styleProps(styles.progressLabel)}>{progress ? `${progress}% complete` : "Preparing pages…"}</p>
            </div>
          </section>
          {showHelp ? <HelpDialog onClose={closeHelp} /> : null}
        </div>
      </main>
    );
  }

  if (!comparison || !currentPage) return null;
  const status = pageStatus(currentPage);
  const pageCount = pages.length;
  const pageChangedCount = changedPages.length;
  const previewPage = mode === "diff" || mode === "semantic-text"
    ? currentPage
    : {
        ...currentPage,
        beforeSrc: earlierPage?.beforeSrc,
        afterSrc: newerPage?.afterSrc,
      };

  return (
    <main {...styleProps(styles.root)}>
      <div {...styleProps(styles.shell)}>
        <header {...styleProps(styles.workspaceBar)}>
          <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
          <div {...styleProps(styles.documentPair)} aria-label="Compared documents">
            <div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>A</span><span {...styleProps(styles.documentChipName)} title={comparison.earlierName}>{comparison.earlierName}</span></div>
            <span {...styleProps(styles.pairArrow)} aria-hidden="true">↔</span>
            <div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>B</span><span {...styleProps(styles.documentChipName)} title={comparison.newerName}>{comparison.newerName}</span></div>
          </div>
          <div {...styleProps(styles.workspaceActions)}>
            <span {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> Local only</span>
            <button {...styleProps(styles.helpButton)} type="button" aria-haspopup="dialog" onClick={() => setShowHelp(true)}><span {...styleProps(styles.helpButtonMark)} aria-hidden="true">?</span><span {...styleProps(styles.desktopOnly)}>Help</span></button>
            <Button variant="outline" size="sm" className={styles.quietButton} onClick={reset}>New comparison</Button>
            <ThemeToggle />
          </div>
        </header>
        <div {...styleProps(styles.busyBar)} aria-hidden="true"><div {...styleProps(styles.busyBarFill)} style={{ width: `${progress}%` }} /></div>
        <div {...styleProps(styles.workspaceMain)}>
          <aside {...styleProps(styles.pageRail)} aria-label="Pages">
            <h2 {...styleProps(styles.railHeading)}>Pages <span aria-hidden="true">·</span> {pageCount}</h2>
            {pages.map((page, index) => {
              const pageState = pageStatus(page);
              return (
                <button key={page.index ?? index} {...styleProps(styles.pageButton, index === pageIndex && styles.pageButtonCurrent)} type="button" aria-label={`Page ${index + 1}, ${statusLabel(pageState)}`} aria-current={index === pageIndex ? "page" : undefined} onClick={() => selectPage(index)}>
                  <div {...styleProps(styles.pageThumb)}>{page.beforeSrc || page.afterSrc ? <img {...styleProps(styles.pageThumbImage)} src={page.beforeSrc ?? page.afterSrc} alt="" draggable={false} /> : <ThumbPlaceholder />} </div>
                  <div {...styleProps(styles.pageNumber)}><span>{index + 1}</span><span {...styleProps(styles.pageStatus, pageState === "changed" && styles.pageStatusChanged, pageState === "added" && styles.pageStatusAdded, pageState === "removed" && styles.pageStatusRemoved)}>{statusSymbol(pageState)}</span></div>
                </button>
              );
            })}
          </aside>
          <section {...styleProps(styles.canvasColumn)} aria-label="PDF comparison">
            <div {...styleProps(styles.toolbar)}>
              <div {...styleProps(styles.toolbarGroup)}>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Previous page" aria-keyshortcuts="ArrowLeft PageUp K P" title="Previous page (←, K, or Page Up)" disabled={pageIndex === 0} onClick={() => selectPage(Math.max(0, pageIndex - 1))}>←</button>
                <span {...styleProps(styles.zoomLabel)}>{pageIndex + 1} / {pageCount}</span>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Next page" aria-keyshortcuts="ArrowRight PageDown J N" title="Next page (→, J, or Page Down)" disabled={pageIndex >= pageCount - 1} onClick={() => selectPage(Math.min(pageCount - 1, pageIndex + 1))}>→</button>
              </div>
              <div {...styleProps(styles.modeGroup)} role="toolbar" aria-label="View mode">
                {viewModes.map((item) => <button key={item.id} {...styleProps(styles.modeButton, mode === item.id && styles.modeButtonCurrent)} type="button" aria-pressed={mode === item.id} aria-keyshortcuts={item.shortcut} title={`${item.label} (${item.shortcut})`} onClick={() => changeMode(item.id)}><span {...styleProps(styles.desktopOnly)}>{item.label}</span><span {...styleProps(styles.mobileOnly)}>{item.shortcut}</span></button>)}
              </div>
              <div {...styleProps(styles.sourceGroup)} role="group" aria-label="Open source page full screen">
                <button {...styleProps(styles.sourceButton)} type="button" aria-label={`Open earlier version of page ${earlierPageIndex + 1} full screen`} title="Open earlier page full screen" disabled={!sourceForSide(earlierPage, "earlier")} onClick={() => openFullPage("earlier")}><span aria-hidden="true">↗</span><span {...styleProps(styles.desktopOnly)}>Earlier</span><span {...styleProps(styles.mobileOnly)}>A</span></button>
                <button {...styleProps(styles.sourceButton)} type="button" aria-label={`Open newer version of page ${newerPageIndex + 1} full screen`} title="Open newer page full screen" disabled={!sourceForSide(newerPage, "newer")} onClick={() => openFullPage("newer")}><span aria-hidden="true">↗</span><span {...styleProps(styles.desktopOnly)}>Newer</span><span {...styleProps(styles.mobileOnly)}>B</span></button>
              </div>
              <div {...styleProps(styles.toolbarGroup)}>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom out" disabled={zoom === zoomLevels[0]} onClick={() => setZoom((value) => zoomLevels[Math.max(0, zoomLevels.indexOf(value as (typeof zoomLevels)[number]) - 1)] ?? 50)}>−</button>
                <span {...styleProps(styles.zoomLabel)}>{zoom}%</span>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom in" disabled={zoom === zoomLevels[zoomLevels.length - 1]} onClick={() => setZoom((value) => zoomLevels[Math.min(zoomLevels.length - 1, zoomLevels.indexOf(value as (typeof zoomLevels)[number]) + 1)] ?? 200)}>+</button>
              </div>
            </div>
            <div {...styleProps(styles.stage)}>
              <div {...styleProps(styles.stageCenter)}>
              <PagePreview page={previewPage} mode={mode} zoom={zoom} swipe={swipe} blinkOn={blinkOn} showBoundingBoxes={showBoundingBoxes} showSemanticHighlights={showSemanticHighlights} selectedRegion={selectedRegion} onRegionClick={selectRegion} onSelectChange={setSelectedRegion} onSwipeChange={setSwipe} />
              </div>
            </div>
            <div {...styleProps(styles.statusFooter)}>
              <span><span {...styleProps(styles.statusAccent)}>{status === "same" ? "No visual changes" : statusLabel(status)}</span> · page {pageIndex + 1}</span>
              <span>A page {earlierPageIndex + 1}/{earlierPageCount} · B page {newerPageIndex + 1}/{newerPageCount}</span>
              <span {...styleProps(styles.shortcutHint)} title="Keyboard shortcuts">← → pages · Shift + ← → A · Ctrl/Cmd + ← → B · 1–7 modes</span>
            </div>
          </section>
          <aside {...styleProps(styles.inspector)} aria-label="Change inspector">
            <h2 {...styleProps(styles.inspectorHeading)}>Change inspector</h2>
            <p {...styleProps(styles.inspectorSubheading)}>Select a change to locate it on the page.</p>
            <div {...styleProps(styles.changeSummary)}>
              <div {...styleProps(styles.statCard)}><span {...styleProps(styles.statLabel)}>Changed pages</span><strong {...styleProps(styles.statValue, pageChangedCount > 0 && styles.statValueWarm)}>{pageChangedCount}</strong></div>
              <div {...styleProps(styles.statCard)}><span {...styleProps(styles.statLabel)}>Changed area</span><strong {...styleProps(styles.statValue, changedPercent > 0 && styles.statValueWarm)}>{changedPercent ? `${changedPercent.toFixed(2)}%` : "—"}</strong></div>
            </div>
            <Button className={styles.compareButton} onClick={goToNextChange}>Next changed page <span aria-hidden="true">→</span></Button>
            <div {...styleProps(styles.inspectorSection)}>
              <div {...styleProps(styles.sectionLabel)}><span>Regions</span><span>{currentRegions.length}</span></div>
              <label {...styleProps(styles.switchRow)}>
                <span {...styleProps(styles.switchLabel)}>Show bounding boxes</span>
                <span {...styleProps(styles.switch, showBoundingBoxes && styles.switchOn)}>
                  <input type="checkbox" role="switch" aria-checked={showBoundingBoxes} checked={showBoundingBoxes} onChange={(event) => setShowBoundingBoxes(event.target.checked)} {...styleProps(styles.switchInput)} />
                  <span {...styleProps(styles.switchThumb, showBoundingBoxes && styles.switchThumbOn)} aria-hidden="true" />
                </span>
              </label>
              {currentRegions.length ? (
                <div {...styleProps(styles.changeList)}>{currentRegions.map((region, index) => <button key={region.id} {...styleProps(styles.changeButton, selectedRegion === region.id && styles.changeButtonCurrent)} type="button" onClick={() => selectRegion(region)}><span {...styleProps(styles.changeDot, region.kind === "added" && styles.changeDotAdded, region.kind === "removed" && styles.changeDotRemoved)} aria-hidden="true" /><span {...styleProps(styles.changeText)}>{region.label ?? `${region.kind ?? "Changed"} region ${index + 1}`}</span><span {...styleProps(styles.changeCount)}>#{index + 1}</span></button>)}</div>
              ) : <div {...styleProps(styles.emptyChanges)}>{status === "same" ? "No regions on this page." : "No regions to inspect."}</div>}
            </div>
            {currentTextChanges.length ? <div {...styleProps(styles.inspectorSection)}><div {...styleProps(styles.sectionLabel)}><span>Text changes</span><span>{currentTextChanges.length}</span></div><div {...styleProps(styles.changeList)}>{currentTextChanges.slice(0, 6).map((change) => <button key={change.id} {...styleProps(styles.changeButton)} type="button" onClick={() => setSelectedRegion(change.id)}><span {...styleProps(styles.changeDot, change.kind === "added" && styles.changeDotAdded, change.kind === "removed" && styles.changeDotRemoved)} aria-hidden="true" /><span {...styleProps(styles.changeText)}>{change.text}</span></button>)}</div></div> : null}
            <div {...styleProps(styles.inspectorSection)}>
              <button {...styleProps(styles.quietButton)} type="button" aria-expanded={showSettings} onClick={() => setShowSettings((value) => !value)}>{showSettings ? "Hide comparison settings" : "Comparison settings"}</button>
              {showSettings ? <div {...styleProps(styles.inspectorSection)}>
                <div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="sensitivity">Sensitivity</label><span {...styleProps(styles.controlValue)}>{sensitivity}</span></div>
                <input id="sensitivity" {...styleProps(styles.range)} type="range" min="0" max="100" value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} />
                <div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="alignment">Alignment</label><select id="alignment" {...styleProps(styles.select)} value={alignment} onChange={(event) => setAlignment(event.target.value as AlignmentMode)}><option value="none">None</option><option value="translation">Translation only</option></select></div>
                {mode === "semantic-text" ? <label {...styleProps(styles.switchRow)}><span {...styleProps(styles.switchLabel)}>Show text highlights</span><span {...styleProps(styles.switch, showSemanticHighlights && styles.switchOn)}><input type="checkbox" role="switch" aria-checked={showSemanticHighlights} checked={showSemanticHighlights} onChange={(event) => setShowSemanticHighlights(event.target.checked)} {...styleProps(styles.switchInput)} /><span {...styleProps(styles.switchThumb, showSemanticHighlights && styles.switchThumbOn)} aria-hidden="true" /></span></label> : null}
                {mode === "swipe" ? <><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="swipe">Swipe position</label><span {...styleProps(styles.controlValue)}>{swipe}%</span></div><input id="swipe" {...styleProps(styles.range)} type="range" min="0" max="100" value={swipe} onChange={(event) => setSwipe(Number(event.target.value))} /></> : null}
              </div> : null}
            </div>
          </aside>
        </div>
        {fullPageSide && fullPage && sourceForSide(fullPage, fullPageSide) ? (
          <FullPageViewer
            page={fullPage}
            pageNumber={fullPageIndex + 1}
            pageCount={fullPageCount}
            earlierName={comparison.earlierName}
            newerName={comparison.newerName}
            side={fullPageSide}
            onSideChange={setFullPageSide}
            onPageChange={goToSourcePage}
            onClose={() => setFullPageSide(null)}
          />
        ) : null}
        {showHelp ? <HelpDialog onClose={closeHelp} /> : null}
      </div>
    </main>
  );
}

export { PdfDiffApp };
