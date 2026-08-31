import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { styles, styleProps, type TailwindClass } from "./styles.js";
import type { DiffPage, DiffRegion, DiffSemanticOverlay, DiffViewMode, PdfDiffViewerProps, SourceSide } from "./types.js";
import { PageRail, StatusFooter, SummaryBar, ViewerToolbar, WorkspaceHeader } from "./ViewerChrome.js";
import { summarizeComparison } from "./summary.js";
import { downloadReport } from "./export.js";
import { helpModes, helpShortcuts, helpSteps } from "./help-content.js";
import { modeNeedsComparedPair, sourceForSide } from "./viewer-utils.js";
import { useViewerState } from "./useViewerState.js";

const MIN_ZOOM = 25;
const MAX_ZOOM = 400;

function zoomStyle(zoom: number): CSSProperties {
  return { zoom: zoom / 100 };
}

function getRegionStyle(region: DiffRegion): CSSProperties {
  return {
    left: `${Math.max(0, Math.min(100, region.x))}%`,
    top: `${Math.max(0, Math.min(100, region.y))}%`,
    width: `${Math.max(0.5, Math.min(100, region.width))}%`,
    height: `${Math.max(0.5, Math.min(100, region.height))}%`,
  };
}

function PaperFallback({ label }: { label: string }) {
  return <div {...styleProps(styles.paperEmpty)}><div><span {...styleProps(styles.placeholderTitle)} aria-hidden="true" /><p>{label}</p></div></div>;
}

function PageImage({ source, alt, imageStyle = styles.pageImage }: { source?: string; alt: string; imageStyle?: TailwindClass }) {
  return source ? <img {...styleProps(imageStyle)} src={source} alt={alt} draggable={false} /> : <PaperFallback label="Preview is still rendering" />;
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
      <header {...styleProps(styles.semanticHeader)}><span>{label}</span></header>
      <div {...styleProps(styles.semanticViewport)}>
        {source ? <img {...styleProps(styles.semanticPageImage)} src={source} alt={`${label} version of this page`} draggable={false} /> : <PaperFallback label={`No ${label.toLowerCase()} page`} />}
        {source && showHighlights && overlays.length ? (
          <svg {...styleProps(styles.semanticOverlay)} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${label} semantic text changes`}>
            {overlays.flatMap((overlay) => overlay.quads.map((quad, index) => (
              <polygon
                key={`${overlay.id}-${index}`}
                {...styleProps(styles.semanticOverlayPolygon, overlay.kind === "added" && styles.semanticOverlayAdded, overlay.kind === "removed" && styles.semanticOverlayRemoved, overlay.kind === "changed" && styles.semanticOverlayChanged, selectedRegion === overlay.id && styles.semanticOverlayCurrent)}
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
              ><title>{overlay.text}</title></polygon>
            )))}
          </svg>
        ) : null}
      </div>
    </article>
  );
}

function semanticSummary(semantic: DiffPage["semantic"]): { changes: string; tokens: string; missingText: boolean; undecodable: boolean } {
  if (!semantic) return { changes: "No semantic text changes", tokens: "Native PDF rendering", missingText: false, undecodable: false };
  const count = semantic.changes.length;
  const undecodable = semantic.textUndecodable === true;
  return {
    changes: undecodable ? "Text could not be read" : count ? `${count} text change${count === 1 ? "" : "s"}` : "No semantic text changes",
    tokens: undecodable ? "Embedded font has no Unicode mapping" : `${semantic.beforeTokenCount} → ${semantic.afterTokenCount} tokens`,
    missingText: !semantic.hasBeforeText && !semantic.hasAfterText,
    undecodable,
  };
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
  const summary = semanticSummary(page.semantic);
  const beforeOverlays = page.semanticBeforeOverlays ?? [];
  const afterOverlays = page.semanticAfterOverlays ?? [];
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedRegion || !showHighlights) return;
    const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(selectedRegion) : selectedRegion.replace(/"/g, '\\"');
    previewRef.current?.querySelector<SVGPolygonElement>(`[data-semantic-change-id="${escapedId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [selectedRegion, showHighlights]);

  return (
    <div ref={previewRef} {...styleProps(styles.paper, styles.semanticPaper)} style={zoomStyle(zoom)}>
      <div {...styleProps(styles.semanticSummary)}><span>{summary.changes}</span><span>{summary.tokens}</span></div>
      <div {...styleProps(styles.semanticLegend)}><span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendRemoved)} />Removed</span><span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendAdded)} />Added</span><span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendChanged)} />Changed</span><span {...styleProps(styles.semanticLegendNote)}>Original PDF rendering · anchored highlights</span></div>
      <div {...styleProps(styles.semanticGrid)}>
        <SemanticNativePane side="earlier" source={page.beforeSrc} overlays={beforeOverlays} selectedRegion={selectedRegion} showHighlights={showHighlights} onSelectChange={onSelectChange} />
        <SemanticNativePane side="newer" source={page.afterSrc} overlays={afterOverlays} selectedRegion={selectedRegion} showHighlights={showHighlights} onSelectChange={onSelectChange} />
      </div>
      {summary.missingText && !summary.undecodable ? <div {...styleProps(styles.semanticNoText)}><strong>No selectable text found</strong><span>Run OCR to calculate semantic text changes.</span></div> : null}
    </div>
  );
}

function SwipePreview({ before, after, zoom, swipe, onSwipeChange }: { before?: string; after?: string; zoom: number; swipe: number; onSwipeChange: (value: number) => void }) {
  const setSwipeFromPointer = (event: PointerEvent<HTMLDivElement>): void => {
    const paper = event.currentTarget.parentElement;
    if (!paper) return;
    const bounds = paper.getBoundingClientRect();
    onSwipeChange(Math.round(Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100))));
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSwipeFromPointer(event);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    setSwipeFromPointer(event);
  };
  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 10 : 1;
    const next = event.key === "ArrowLeft" ? Math.max(0, swipe - step) : event.key === "ArrowRight" ? Math.min(100, swipe + step) : event.key === "Home" ? 0 : event.key === "End" ? 100 : null;
    if (next === null) return;
    event.preventDefault();
    onSwipeChange(next);
  };
  const sizingSource = before ?? after;
  return <div {...styleProps(styles.paper, styles.swipeWrap)} style={zoomStyle(zoom)}>{sizingSource ? <img {...styleProps(styles.swipeSizer)} src={sizingSource} alt="" aria-hidden="true" draggable={false} /> : <PaperFallback label="Preview is still rendering" />}{before ? <div {...styleProps(styles.swipeLayer)} style={{ clipPath: `inset(0 ${100 - swipe}% 0 0)` }}><img {...styleProps(styles.swipeLayerImage)} src={before} alt="Earlier version of this page" draggable={false} /></div> : null}{after ? <div {...styleProps(styles.swipeLayer)} style={{ clipPath: `inset(0 0 0 ${swipe}%)` }}><img {...styleProps(styles.swipeLayerImage)} src={after} alt="Newer version of this page" draggable={false} /></div> : null}<div {...styleProps(styles.swipeHandle)} style={{ left: `${swipe}%` }} role="slider" aria-label="Swipe position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={swipe} aria-valuetext={`${swipe}%`} tabIndex={0} onKeyDown={handleKeyDown} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd}><span {...styleProps(styles.swipeDivider)} aria-hidden="true" /></div></div>;
}

function PagePreview({
  page,
  mode,
  zoom,
  swipe,
  showBoundingBoxes,
  showSemanticHighlights,
  selectedRegion,
  onRegionClick,
  onSelectChange,
  onSwipeChange,
  pairComparisonPending,
  pairError,
}: {
  page: DiffPage;
  mode: DiffViewMode;
  zoom: number;
  swipe: number;
  showBoundingBoxes: boolean;
  showSemanticHighlights: boolean;
  selectedRegion: string | null;
  onRegionClick: (region: DiffRegion) => void;
  onSelectChange: (id: string) => void;
  onSwipeChange: (value: number) => void;
  pairComparisonPending: boolean;
  pairError: string | null;
}) {
  const before = page.beforeSrc;
  const after = page.afterSrc;
  const diff = page.diffSrc;
  const unavailable = comparedPairUnavailable(mode, pairComparisonPending, pairError, zoom);
  if (unavailable) return unavailable;
  if (mode === "semantic-text") return <SemanticPdfPreview page={page} zoom={zoom} selectedRegion={selectedRegion} showHighlights={showSemanticHighlights} onSelectChange={onSelectChange} />;

  if (mode === "side-by-side") return <div {...styleProps(styles.paper)} style={zoomStyle(zoom)}><div {...styleProps(styles.sideBySide)}><div {...styleProps(styles.sidePanel)}><PageImage source={before} alt="Earlier version of this page" /></div><div {...styleProps(styles.sidePanel)}><PageImage source={after} alt="Newer version of this page" /></div></div></div>;
  if (mode === "swipe") return <SwipePreview before={before} after={after} zoom={zoom} swipe={swipe} onSwipeChange={onSwipeChange} />;
  return <DiffPreview page={page} source={diff ?? before} hasDiff={Boolean(diff)} zoom={zoom} showBoundingBoxes={showBoundingBoxes} selectedRegion={selectedRegion} onRegionClick={onRegionClick} />;
}

function comparedPairUnavailable(mode: DiffViewMode, pending: boolean, error: string | null, zoom: number) {
  if (!modeNeedsComparedPair(mode)) return null;
  if (pending) return <div {...styleProps(styles.paper)} style={zoomStyle(zoom)}><PaperFallback label="Preparing the selected A and B pages…" /></div>;
  return error ? <div {...styleProps(styles.paper)} style={zoomStyle(zoom)}><PaperFallback label={error} /></div> : null;
}

function DiffPreview({ page, source, hasDiff, zoom, showBoundingBoxes, selectedRegion, onRegionClick }: { page: DiffPage; source?: string; hasDiff: boolean; zoom: number; showBoundingBoxes: boolean; selectedRegion: string | null; onRegionClick: (region: DiffRegion) => void }) {
  const regions = showBoundingBoxes ? page.regions ?? [] : [];
  return <div {...styleProps(styles.paper)} style={zoomStyle(zoom)}><PageImage source={source} alt={hasDiff ? "Visual diff of this page" : "Earlier version of this page"} imageStyle={hasDiff ? styles.diffImage : styles.pageImage} />{!hasDiff && page.status === "changed" ? <div {...styleProps(styles.changeOverlayLegend)}>Added · Removed</div> : null}{regions.map((region) => <button key={region.id} type="button" aria-label={region.label ?? `${region.kind ?? "changed"} region`} title={region.label} {...styleProps(styles.changeOverlay, region.kind === "added" && styles.changeOverlayAdded, region.kind === "removed" && styles.changeOverlayRemoved, selectedRegion === region.id && styles.changeOverlayCurrent)} onClick={() => onRegionClick(region)} style={getRegionStyle(region)} />)}</div>;
}

interface DragState {
  pointerId: number;
  clientX: number;
  clientY: number;
  scrollLeft: number;
  scrollTop: number;
}

interface ZoomAnchor {
  xRatio: number;
  yRatio: number;
  viewportX: number;
  viewportY: number;
}

function PanZoomStage({ zoom, onZoomChange, children }: { zoom: number; onZoomChange: (zoom: number) => void; children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    const anchor = zoomAnchorRef.current;
    if (!stage || !anchor) return;
    zoomAnchorRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      stage.scrollLeft = anchor.xRatio * stage.scrollWidth - anchor.viewportX;
      stage.scrollTop = anchor.yRatio * stage.scrollHeight - anchor.viewportY;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [zoom]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const viewportX = event.clientX - bounds.left;
    const viewportY = event.clientY - bounds.top;
    const rawZoom = zoom * Math.exp(-event.deltaY * 0.0015);
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(rawZoom / 5) * 5));
    if (nextZoom === zoom) return;
    zoomAnchorRef.current = {
      xRatio: (stage.scrollLeft + viewportX) / Math.max(1, stage.scrollWidth),
      yRatio: (stage.scrollTop + viewportY) / Math.max(1, stage.scrollHeight),
      viewportX,
      viewportY,
    };
    onZoomChange(nextZoom);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, input, select, a, [role='slider']")) return;
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
    };
    setPanning(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    const drag = dragRef.current;
    if (!stage || !drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    stage.scrollLeft = drag.scrollLeft - (event.clientX - drag.clientX);
    stage.scrollTop = drag.scrollTop - (event.clientY - drag.clientY);
  };

  const stopPanning = (event: PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (stage?.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setPanning(false);
  };

  return (
    <div
      ref={stageRef}
      {...styleProps(styles.stage, panning && styles.stagePanning)}
      aria-label="Document canvas. Scroll to zoom and drag to pan."
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPanning}
      onPointerCancel={stopPanning}
    >
      <div {...styleProps(styles.stageCenter)}>{children}</div>
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
  const fileName = side === "earlier" ? earlierName : newerName;
  const sourceLabel = side === "earlier" ? "Earlier" : "Newer";
  useEffect(() => { closeButtonRef.current?.focus(); }, []);
  if (!source) return null;
  return (
    <div {...styleProps(styles.fullPageBackdrop)} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section {...styleProps(styles.fullPageDialog)} role="dialog" aria-modal="true" aria-labelledby="full-page-viewer-title">
        <header {...styleProps(styles.fullPageToolbar)}><div {...styleProps(styles.fullPageHeading)}><h2 id="full-page-viewer-title" {...styleProps(styles.fullPageTitle)} title={fileName}>{fileName}</h2></div><div {...styleProps(styles.fullPageActions)}><div {...styleProps(styles.sourceGroup)} role="group" aria-label="Source page"><button {...styleProps(styles.sourceButton, side === "earlier" && styles.modeButtonCurrent)} type="button" aria-pressed={side === "earlier"} disabled={!sourceForSide(page, "earlier")} onClick={() => onSideChange("earlier")}>Earlier</button><button {...styleProps(styles.sourceButton, side === "newer" && styles.modeButtonCurrent)} type="button" aria-pressed={side === "newer"} disabled={!sourceForSide(page, "newer")} onClick={() => onSideChange("newer")}>Newer</button></div><div {...styleProps(styles.fullPagePageNav)} aria-label={`${sourceLabel} page navigation`}><button {...styleProps(styles.iconButton)} type="button" aria-label="Previous source page" disabled={pageNumber <= 1} onClick={() => onPageChange(side, pageNumber - 2)}>←</button><span {...styleProps(styles.fullPagePagePosition)}>Page {pageNumber} / {pageCount}</span><button {...styleProps(styles.iconButton)} type="button" aria-label="Next source page" disabled={pageNumber >= pageCount} onClick={() => onPageChange(side, pageNumber)}>→</button></div><button ref={closeButtonRef} {...styleProps(styles.iconButton, styles.fullPageClose)} type="button" aria-label="Close full-page view" title="Close full-page view (Escape)" onClick={onClose}>×</button></div></header>
        <div {...styleProps(styles.fullPageStage)}><img {...styleProps(styles.fullPageImage)} src={source} alt={`${sourceLabel} version of page ${pageNumber}`} draggable={false} /></div>
        <footer {...styleProps(styles.fullPageFooter)}><span>Shift + ← → Earlier · Ctrl/Cmd + ← → Newer · Esc to close</span></footer>
      </section>
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div {...styleProps(styles.fullPageBackdrop)} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section {...styleProps(styles.helpDialog)} role="dialog" aria-modal="true" aria-labelledby="viewer-help-title">
        <header {...styleProps(styles.helpHeader)}><h2 id="viewer-help-title" {...styleProps(styles.helpTitle)}>How to compare PDFs</h2><button ref={closeButtonRef} {...styleProps(styles.iconButton)} type="button" aria-label="Close help" onClick={onClose}>×</button></header>
        <div {...styleProps(styles.helpBody)}>
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-start"><h3 id="viewer-help-start" {...styleProps(styles.helpSectionTitle)}>In the workspace</h3><ol {...styleProps(styles.helpSteps)}>{helpSteps.map((step) => <li key={step.number} {...styleProps(styles.helpStep)}><span {...styleProps(styles.helpKey)}>{step.number}</span><h4 {...styleProps(styles.helpStepTitle)}>{step.title}</h4><p {...styleProps(styles.helpStepCopy)}>{step.copy}</p></li>)}</ol></section>
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-modes"><h3 id="viewer-help-modes" {...styleProps(styles.helpSectionTitle)}>View modes</h3><div {...styleProps(styles.helpModeList)}>{helpModes.map(([name, copy]) => <p key={name} {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>{name}</strong> — {copy}</p>)}</div></section>
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-shortcuts"><h3 id="viewer-help-shortcuts" {...styleProps(styles.helpSectionTitle)}>Shortcuts</h3><div {...styleProps(styles.helpShortcutGrid)}>{helpShortcuts.map(([shortcut, copy]) => <p key={shortcut} {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>{shortcut}</kbd><span>{copy}</span></p>)}</div></section>
          <p {...styleProps(styles.helpNote)}><strong>Settings apply when a comparison starts.</strong></p>
        </div>
        <footer {...styleProps(styles.helpFooter)}><button {...styleProps(styles.quietButton)} type="button" onClick={onClose}>Back to comparison</button></footer>
      </section>
    </div>
  );
}

export function PdfDiffViewer({ comparison, processingProgress, headerActions, onNewComparison }: PdfDiffViewerProps) {
  const viewer = useViewerState({ comparison });
  const [hideNoise, setHideNoise] = useState(true);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const summary = summarizeComparison(comparison);
  const {
    pages, pageIndex, mode, zoom, swipe, selectedRegion,
    fullPageSide, earlierPageIndex, newerPageIndex, showHelp, earlierPageCount,
    newerPageCount, pairComparisonPending, pairError, currentPage, earlierPage, newerPage,
    fullPageIndex, fullPage, fullPageCount, previewPage, selectPage,
    goToSourcePage, changeMode, setZoom, setSwipe, setSelectedRegion,
    setFullPageSide, setShowHelp,
  } = viewer;
  const closeHelp = () => setShowHelp(false);
  if (!currentPage || !previewPage) return null;
  return (
    <section {...styleProps(styles.viewerRoot)} aria-label="PDF comparison workspace">
      <WorkspaceHeader comparison={comparison} onNewComparison={onNewComparison} onHelp={() => setShowHelp(true)} headerActions={headerActions} />
      <SummaryBar summary={summary} hideNoise={hideNoise} onHideNoiseChange={setHideNoise} onlyChanged={onlyChanged} onOnlyChangedChange={setOnlyChanged} onExport={(format) => downloadReport(comparison, format)} />
      <div {...styleProps(styles.workspaceMain, pages.length <= 1 && styles.workspaceMainSinglePage)}>
        <PageRail onlyChanged={onlyChanged} hideNoise={hideNoise} pages={pages} pageIndex={pageIndex} earlierPageIndex={earlierPageIndex} newerPageIndex={newerPageIndex} earlierPageCount={earlierPageCount} newerPageCount={newerPageCount} onSelectPage={selectPage} onSourcePageChange={goToSourcePage} />
        <section {...styleProps(styles.canvasColumn)} aria-label="PDF comparison">
          <ViewerToolbar mode={mode} onModeChange={changeMode} zoom={zoom} onZoomChange={setZoom} earlierPage={earlierPage} newerPage={newerPage} earlierPageIndex={earlierPageIndex} newerPageIndex={newerPageIndex} onOpenSource={setFullPageSide} textUnavailable={previewPage.semantic?.textUndecodable} />
          <PanZoomStage zoom={zoom} onZoomChange={setZoom}><PagePreview page={previewPage} mode={mode} zoom={zoom} swipe={swipe} showBoundingBoxes showSemanticHighlights selectedRegion={selectedRegion} onRegionClick={(region) => setSelectedRegion(region.id)} onSelectChange={setSelectedRegion} onSwipeChange={setSwipe} pairComparisonPending={pairComparisonPending} pairError={pairError} /></PanZoomStage>
          <StatusFooter processingProgress={processingProgress} />
        </section>
      </div>
      {fullPageSide && fullPage && sourceForSide(fullPage, fullPageSide) ? <FullPageViewer page={fullPage} pageNumber={fullPageIndex + 1} pageCount={fullPageCount} earlierName={comparison.earlierName} newerName={comparison.newerName} side={fullPageSide} onSideChange={setFullPageSide} onPageChange={goToSourcePage} onClose={() => setFullPageSide(null)} /> : null}
      {showHelp ? <HelpDialog onClose={closeHelp} /> : null}
    </section>
  );
}
