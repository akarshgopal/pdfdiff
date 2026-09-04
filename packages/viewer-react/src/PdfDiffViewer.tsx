import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { styles, styleProps, type TailwindClass } from "./styles.js";
import type { DiffPage, DiffRegion, DiffSemanticOverlay, DiffViewMode, PdfDiffViewerProps, SourceSide, ViewerSettings } from "./types.js";
import { PageRail, SettingsDialog, StatusFooter, ViewerToolbar, WorkspaceHeader } from "./ViewerChrome.js";
import { summarizeComparison } from "./summary.js";
import { canDownloadPageImage, downloadPageImage, downloadReport } from "./export.js";
import { helpModes, helpShortcuts, helpSteps } from "./help-content.js";
import { clampZoom, toggleFullscreen } from "./viewer-utils.js";
import { useViewerState } from "./useViewerState.js";
import { OverlayLayerStack } from "./OverlayLayers.js";
import type { OverlayStyle } from "./types.js";

export const DEFAULT_OVERLAY_STYLE: OverlayStyle = { addedColor: "#10bebe", removedColor: "#ee4856", modifiedColor: "#b87edc", unchangedOpacity: 0.24 };

function getRegionStyle(region: DiffRegion): CSSProperties {
  return {
    left: `${Math.max(0, Math.min(100, region.x))}%`,
    top: `${Math.max(0, Math.min(100, region.y))}%`,
    width: `${Math.max(0.5, Math.min(100, region.width))}%`,
    height: `${Math.max(0.5, Math.min(100, region.height))}%`,
  };
}

function PaperFallback({ label }: { label: string }) {
  return <div {...styleProps(styles.paperEmpty)} role="status" aria-label={label}><div {...styleProps(styles.paperSkeleton)} aria-hidden="true"><span {...styleProps(styles.paperSkeletonLine)} /><span {...styleProps(styles.paperSkeletonLine, styles.paperSkeletonLineShort)} /><span {...styleProps(styles.paperSkeletonBlock)} /><span {...styleProps(styles.paperSkeletonLine)} /><span {...styleProps(styles.paperSkeletonLine, styles.paperSkeletonLineShort)} /></div></div>;
}

function CanvasNotice({ pending, error }: { pending: boolean; error: string | null }) {
  if (!pending && !error) return null;
  return <div {...styleProps(styles.canvasNotice, Boolean(error) && styles.canvasNoticeError)} role="status" aria-live="polite">{error ?? "Comparing…"}</div>;
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
  pending,
  error,
  selectedRegion,
  showHighlights,
  onSelectChange,
}: {
  page: DiffPage;
  pending: boolean;
  error: string | null;
  selectedRegion: string | null;
  showHighlights: boolean;
  onSelectChange: (id: string) => void;
}) {
  const summary = semanticSummary(page.semantic);
  const waiting = pending || Boolean(error);
  const beforeOverlays = page.semanticBeforeOverlays ?? [];
  const afterOverlays = page.semanticAfterOverlays ?? [];
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedRegion || !showHighlights) return;
    const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(selectedRegion) : selectedRegion.replace(/"/g, '\\"');
    previewRef.current?.querySelector<SVGPolygonElement>(`[data-semantic-change-id="${escapedId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [selectedRegion, showHighlights]);

  return (
    <div ref={previewRef} {...styleProps(styles.paper, styles.paperTwoUp, styles.semanticPaper)}>
      <CanvasNotice pending={pending} error={error} />
      {!waiting ? <><div {...styleProps(styles.semanticSummary)}><span>{summary.changes}</span><span>{summary.tokens}</span></div><div {...styleProps(styles.semanticLegend)}><span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendRemoved)} />Removed</span><span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendAdded)} />Added</span><span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendChanged)} />Changed</span><span {...styleProps(styles.semanticLegendNote)}>Original PDF rendering · anchored highlights</span></div></> : null}
      <div {...styleProps(styles.semanticGrid)}>
        <SemanticNativePane side="earlier" source={page.beforeSrc} overlays={beforeOverlays} selectedRegion={selectedRegion} showHighlights={showHighlights} onSelectChange={onSelectChange} />
        <SemanticNativePane side="newer" source={page.afterSrc} overlays={afterOverlays} selectedRegion={selectedRegion} showHighlights={showHighlights} onSelectChange={onSelectChange} />
      </div>
      {summary.missingText && !summary.undecodable ? <div {...styleProps(styles.semanticNoText)}><strong>No selectable text found</strong><span>Run OCR to calculate semantic text changes.</span></div> : null}
    </div>
  );
}

function SwipePreview({ before, after, swipe, onSwipeChange, pending, error }: { before?: string; after?: string; swipe: number; onSwipeChange: (value: number) => void; pending: boolean; error: string | null }) {
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
  return <div {...styleProps(styles.paper, styles.swipeWrap)}>{sizingSource ? <img {...styleProps(styles.swipeSizer)} src={sizingSource} alt="" aria-hidden="true" draggable={false} /> : <PaperFallback label="Preview is still rendering" />}{before ? <div {...styleProps(styles.swipeLayer)} style={{ clipPath: `inset(0 ${100 - swipe}% 0 0)` }}><img {...styleProps(styles.swipeLayerImage)} src={before} alt="Earlier version of this page" draggable={false} /></div> : null}{after ? <div {...styleProps(styles.swipeLayer)} style={{ clipPath: `inset(0 0 0 ${swipe}%)` }}><img {...styleProps(styles.swipeLayerImage)} src={after} alt="Newer version of this page" draggable={false} /></div> : null}<div {...styleProps(styles.swipeHandle)} style={{ left: `${swipe}%` }} role="slider" aria-label="Swipe position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={swipe} aria-valuetext={`${swipe}%`} aria-disabled={pending || Boolean(error)} tabIndex={pending || error ? -1 : 0} onKeyDown={handleKeyDown} onPointerDown={pending || error ? undefined : handlePointerDown} onPointerMove={pending || error ? undefined : handlePointerMove} onPointerUp={pending || error ? undefined : handlePointerEnd} onPointerCancel={pending || error ? undefined : handlePointerEnd}><span {...styleProps(styles.swipeDivider)} aria-hidden="true" /></div><CanvasNotice pending={pending} error={error} /></div>;
}

function PagePreview({
  page,
  mode,
  swipe,
  overlay,
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
  swipe: number;
  overlay: OverlayStyle;
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
  if (mode === "semantic-text") return <SemanticPdfPreview page={page} pending={pairComparisonPending} error={pairError} selectedRegion={selectedRegion} showHighlights={showSemanticHighlights} onSelectChange={onSelectChange} />;

  if (mode === "side-by-side") return <div {...styleProps(styles.paper, styles.paperTwoUp)}><div {...styleProps(styles.sideBySide)}><div {...styleProps(styles.sidePanel)}><PageImage source={before} alt="Earlier version of this page" /></div><div {...styleProps(styles.sidePanel)}><PageImage source={after} alt="Newer version of this page" /></div></div></div>;
  if (mode === "swipe") return <SwipePreview before={before} after={after} swipe={swipe} onSwipeChange={onSwipeChange} pending={pairComparisonPending} error={pairError} />;
  return <DiffPreview page={page} source={diff ?? before} hasDiff={Boolean(diff)} overlay={overlay} showBoundingBoxes={showBoundingBoxes} selectedRegion={selectedRegion} onRegionClick={onRegionClick} pending={pairComparisonPending} error={pairError} />;
}

function DiffPreview({ page, source, hasDiff, overlay, showBoundingBoxes, selectedRegion, onRegionClick, pending, error }: { page: DiffPage; source?: string; hasDiff: boolean; overlay: OverlayStyle; showBoundingBoxes: boolean; selectedRegion: string | null; onRegionClick: (region: DiffRegion) => void; pending: boolean; error: string | null }) {
  const regions = showBoundingBoxes ? page.regions ?? [] : [];
  return <div {...styleProps(styles.paper)}>{page.layers ? <OverlayLayerStack page={page} overlay={overlay} alt="Visual diff of this page" /> : <PageImage source={source} alt={hasDiff ? "Visual diff of this page" : "Earlier version of this page"} imageStyle={hasDiff ? styles.diffImage : styles.pageImage} />}<CanvasNotice pending={pending} error={error} />{page.status === "changed" ? <div {...styleProps(styles.changeOverlayLegend)} aria-label="Overlay colours"><span {...styleProps(styles.changeOverlayKey)}><i {...styleProps(styles.changeOverlayDot)} style={{ backgroundColor: overlay.addedColor }} />Added</span><span {...styleProps(styles.changeOverlayKey)}><i {...styleProps(styles.changeOverlayDot)} style={{ backgroundColor: overlay.removedColor }} />Removed</span><span {...styleProps(styles.changeOverlayKey)}><i {...styleProps(styles.changeOverlayDot)} style={{ backgroundColor: overlay.modifiedColor }} />Modified</span></div> : null}{regions.map((region) => <button key={region.id} type="button" aria-label={region.label ?? `${region.kind ?? "changed"} region`} title={region.label} {...styleProps(styles.changeOverlay, region.kind === "added" && styles.changeOverlayAdded, region.kind === "removed" && styles.changeOverlayRemoved, selectedRegion === region.id && styles.changeOverlayCurrent)} onClick={() => onRegionClick(region)} style={getRegionStyle(region)} />)}</div>;
}

/** The stage's content box: its padding keeps the page clear of the toolbar edges. */
function stageBox(stage: HTMLElement): { width: number; height: number } {
  const padding = parseFloat(getComputedStyle(stage).paddingLeft) || 0;
  return { width: stage.clientWidth - padding * 2, height: stage.clientHeight - padding * 2 };
}

/** 100% zoom shows the whole page, whatever the mode lays out; zoom scales up from there. */
function fitScale(stage: HTMLElement, content: HTMLElement): number {
  if (!content.offsetWidth || !content.offsetHeight) return 1;
  const { width, height } = stageBox(stage);
  return Math.min(width / content.offsetWidth, height / content.offsetHeight);
}

function PanZoomStage({ zoom, onZoomChange, resetKey, children }: { zoom: number; onZoomChange: (zoom: number) => void; resetKey: string; children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const [panning, setPanning] = useState(false);

  // The transform is written straight to the node. Scaling a composited layer
  // costs no relayout, and panning this way costs no React render either.
  const applyTransform = useCallback((zoomPercent: number) => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return;
    const { width, height } = stageBox(stage);
    const scale = fitScale(stage, content) * zoomPercent / 100;
    const overflowX = Math.max(0, (content.offsetWidth * scale - width) / 2);
    const overflowY = Math.max(0, content.offsetHeight * scale - height);
    const { x, y } = panRef.current;
    panRef.current = { x: Math.max(-overflowX, Math.min(overflowX, x)), y: Math.max(-overflowY, Math.min(0, y)) };
    content.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${scale})`;
  }, []);

  useEffect(() => applyTransform(zoom), [zoom, applyTransform]);
  useEffect(() => {
    panRef.current = { x: 0, y: 0 };
    applyTransform(zoom);
    // A new page or view starts centred; keeping the old pan would land the
    // reviewer somewhere off the page.
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Page images arrive after layout and the window resizes, both of which move
  // the fit, so the scale is recomputed whenever either box changes.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  });
  useEffect(() => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return;
    const observer = new ResizeObserver(() => applyTransform(zoomRef.current));
    observer.observe(stage);
    observer.observe(content);
    return () => observer.disconnect();
  }, [applyTransform]);

  // React attaches onWheel as a passive root listener, where preventDefault is
  // ignored, so the zoom handler owns a non-passive listener on the stage.
  const handleWheel = (event: globalThis.WheelEvent) => {
    const content = contentRef.current;
    if (!content) return;
    const nextZoom = clampZoom(Math.round(zoom * Math.exp(-event.deltaY * 0.0015) / 5) * 5);
    if (nextZoom === zoom) return;
    // Hold the point under the cursor still. The shift is its distance from
    // the transform origin times the scale change — and the origin is the
    // top edge but the horizontal centre, so x measures from the middle.
    const rect = content.getBoundingClientRect();
    const shrink = 1 - nextZoom / zoom;
    panRef.current = {
      x: panRef.current.x + (event.clientX - rect.left - rect.width / 2) * shrink,
      y: panRef.current.y + (event.clientY - rect.top) * shrink,
    };
    onZoomChange(nextZoom);
  };
  const wheelHandler = useRef(handleWheel);
  useEffect(() => {
    wheelHandler.current = handleWheel;
  });
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const listener = (event: globalThis.WheelEvent): void => {
      event.preventDefault();
      wheelHandler.current(event);
    };
    stage.addEventListener("wheel", listener, { passive: false });
    return () => stage.removeEventListener("wheel", listener);
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, input, select, a, [role='slider']")) return;
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, panX: panRef.current.x, panY: panRef.current.y };
    setPanning(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    panRef.current = { x: drag.panX + (event.clientX - drag.clientX), y: drag.panY + (event.clientY - drag.clientY) };
    applyTransform(zoom);
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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPanning}
      onPointerCancel={stopPanning}
    >
      <div {...styleProps(styles.stageCenter)}><div ref={contentRef} {...styleProps(styles.stageContent)}>{children}</div></div>
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
    <div {...styleProps(styles.dialogBackdrop)} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section {...styleProps(styles.helpDialog)} role="dialog" aria-modal="true" aria-labelledby="viewer-help-title">
        <header {...styleProps(styles.helpHeader)}><h2 id="viewer-help-title" {...styleProps(styles.helpTitle)}>How to compare PDFs</h2><button ref={closeButtonRef} {...styleProps(styles.iconButton)} type="button" aria-label="Close help" onClick={onClose}>×</button></header>
        <div {...styleProps(styles.helpBody)}>
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-start"><h3 id="viewer-help-start" {...styleProps(styles.helpSectionTitle)}>In the workspace</h3><ol {...styleProps(styles.helpSteps)}>{helpSteps.map((step) => <li key={step.number} {...styleProps(styles.helpStep)}><span {...styleProps(styles.helpKey)}>{step.number}</span><h4 {...styleProps(styles.helpStepTitle)}>{step.title}</h4><p {...styleProps(styles.helpStepCopy)}>{step.copy}</p></li>)}</ol></section>
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-modes"><h3 id="viewer-help-modes" {...styleProps(styles.helpSectionTitle)}>View modes</h3><div {...styleProps(styles.helpModeList)}>{helpModes.map(([name, copy]) => <p key={name} {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>{name}</strong> — {copy}</p>)}</div></section>
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-shortcuts"><h3 id="viewer-help-shortcuts" {...styleProps(styles.helpSectionTitle)}>Shortcuts</h3><div {...styleProps(styles.helpShortcutGrid)}>{helpShortcuts.map(([shortcut, copy]) => <p key={shortcut} {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>{shortcut}</kbd><span>{copy}</span></p>)}</div></section>
          <p {...styleProps(styles.helpNote)}><strong>Colours and view filters apply immediately.</strong> Changing page matching runs the comparison again.</p>
        </div>
        <footer {...styleProps(styles.helpFooter)}><button {...styleProps(styles.quietButton)} type="button" onClick={onClose}>Back to comparison</button></footer>
      </section>
    </div>
  );
}

const DEFAULT_SETTINGS: ViewerSettings = { showBoundingBoxes: false, hideNoise: true, onlyChanged: false };

export function PdfDiffViewer({ comparison, processingProgress, headerActions, onNewComparison, defaultOverlay, onOverlayChange, matchPages, onMatchPagesChange }: PdfDiffViewerProps) {
  // The save shortcut needs the live overlay settings, which are owned below;
  // the ref keeps the keyboard hook from depending on render order.
  const saveRef = useRef<() => void>(() => undefined);
  const viewer = useViewerState({ comparison, onSave: () => saveRef.current() });
  const [overlay, setOverlay] = useState<OverlayStyle>(defaultOverlay ?? DEFAULT_OVERLAY_STYLE);
  const changeOverlay = (next: OverlayStyle): void => {
    setOverlay(next);
    onOverlayChange?.(next);
  };
  const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const summary = useMemo(() => summarizeComparison(comparison), [comparison]);
  const {
    pages, pageIndex, mode, zoom, swipe, selectedRegion,
    earlierPageIndex, newerPageIndex, showHelp, earlierPageCount,
    newerPageCount, pairComparisonPending, pairError, currentPage, previewPage,
    selectPage, stepChange, hasChanges, goToSourcePage, changeMode, setZoom, setSwipe, setSelectedRegion, setShowHelp,
  } = viewer;
  useEffect(() => {
    saveRef.current = () => { if (previewPage) void downloadPageImage(comparison, previewPage, overlay); };
  });
  // Fullscreen can also be left with Escape or the browser's own chrome, so the
  // button follows the document rather than its own state.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  if (!currentPage || !previewPage) return null;
  return (
    <section {...styleProps(styles.viewerRoot)} aria-label="PDF comparison workspace">
      <WorkspaceHeader comparison={comparison} summary={summary} processingProgress={processingProgress} onNewComparison={onNewComparison} headerActions={headerActions} />
      <div {...styleProps(styles.workspaceMain, pages.length <= 1 && styles.workspaceMainSinglePage)}>
        <PageRail onlyChanged={settings.onlyChanged} hideNoise={settings.hideNoise} pages={pages} pageIndex={pageIndex} earlierPageIndex={earlierPageIndex} newerPageIndex={newerPageIndex} earlierPageCount={earlierPageCount} newerPageCount={newerPageCount} onSelectPage={selectPage} onSourcePageChange={goToSourcePage} />
        <section {...styleProps(styles.canvasColumn)} aria-label="PDF comparison">
          <ViewerToolbar mode={mode} onModeChange={changeMode} onStepChange={stepChange} hasChanges={hasChanges} zoom={zoom} onZoomChange={setZoom} textUnavailable={previewPage.semantic?.textUndecodable} isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} onSettings={() => setShowSettings(true)} onHelp={() => setShowHelp(true)} canExportImage={canDownloadPageImage(previewPage)} onExport={(choice) => { if (choice === "page-image") void downloadPageImage(comparison, previewPage, overlay); else downloadReport(comparison, choice); }} />
          <PanZoomStage zoom={zoom} onZoomChange={setZoom} resetKey={`${mode}:${earlierPageIndex}:${newerPageIndex}`}><PagePreview page={previewPage} mode={mode} swipe={swipe} overlay={overlay} showBoundingBoxes={settings.showBoundingBoxes} showSemanticHighlights selectedRegion={selectedRegion} onRegionClick={(region) => setSelectedRegion(region.id)} onSelectChange={setSelectedRegion} onSwipeChange={setSwipe} pairComparisonPending={pairComparisonPending} pairError={pairError} /></PanZoomStage>
          <StatusFooter processingProgress={processingProgress} />
        </section>
      </div>
      {showSettings ? <SettingsDialog overlay={overlay} onOverlayChange={changeOverlay} settings={settings} onSettingsChange={setSettings} matchPages={matchPages} onMatchPagesChange={onMatchPagesChange} onClose={() => setShowSettings(false)} /> : null}
      {showHelp ? <HelpDialog onClose={() => setShowHelp(false)} /> : null}
    </section>
  );
}
