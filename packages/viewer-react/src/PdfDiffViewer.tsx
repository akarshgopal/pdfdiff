/* The reusable package cannot depend on Next.js's Image component. */
/* eslint-disable @next/next/no-img-element */
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
} from "react";
import { styles, styleProps, type TailwindClass } from "./styles.js";
import type { DiffPage, DiffRegion, DiffSemanticOverlay, DiffViewMode, PdfDiffViewerProps, SourceSide } from "./types.js";
import { ChangeInspector, PageRail, StatusFooter, ViewerToolbar, WorkspaceHeader } from "./ViewerChrome.js";
import { helpModes, helpShortcuts, helpSteps } from "./help-content.js";
import { pageStatus, sourceForSide } from "./viewer-utils.js";
import { useViewerState } from "./useViewerState.js";

function zoomStyle(zoom: number): TailwindClass {
  return styles[`paperZoom${zoom}` as keyof typeof styles] as TailwindClass;
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
      <header {...styleProps(styles.semanticHeader)}><span>{label}</span><span>{overlays.length ? `${overlays.length} changes` : "Native page"}</span></header>
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
    previewRef.current?.querySelector<SVGPolygonElement>(`[data-semantic-change-id="${escapedId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [selectedRegion, showHighlights]);

  return (
    <div ref={previewRef} {...styleProps(styles.paper, styles.semanticPaper, zoomStyle(zoom))}>
      <div {...styleProps(styles.semanticSummary)}><span>{semantic?.changes.length ? `${semantic.changes.length} text change${semantic.changes.length === 1 ? "" : "s"}` : "No semantic text changes"}</span><span>{semantic ? `${semantic.beforeTokenCount} → ${semantic.afterTokenCount} tokens` : "Native PDF rendering"}</span></div>
      <div {...styleProps(styles.semanticLegend)}><span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendRemoved)} />Removed</span><span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendAdded)} />Added</span><span><i {...styleProps(styles.semanticLegendDot, styles.semanticLegendChanged)} />Changed</span><span {...styleProps(styles.semanticLegendNote)}>Original PDF rendering · anchored highlights</span></div>
      <div {...styleProps(styles.semanticGrid)}>
        <SemanticNativePane side="earlier" source={page.beforeSrc} overlays={page.semanticBeforeOverlays ?? []} selectedRegion={selectedRegion} showHighlights={showHighlights} onSelectChange={onSelectChange} />
        <SemanticNativePane side="newer" source={page.afterSrc} overlays={page.semanticAfterOverlays ?? []} selectedRegion={selectedRegion} showHighlights={showHighlights} onSelectChange={onSelectChange} />
      </div>
      {semantic && !semantic.hasBeforeText && !semantic.hasAfterText ? <div {...styleProps(styles.semanticNoText)}><strong>No selectable text found</strong><span>The native pages remain available; run OCR to calculate semantic text changes.</span></div> : null}
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
  return <div {...styleProps(styles.paper, styles.swipeWrap, zoomStyle(zoom))}>{sizingSource ? <img {...styleProps(styles.swipeSizer)} src={sizingSource} alt="" aria-hidden="true" draggable={false} /> : <PaperFallback label="Preview is still rendering" />}{before ? <div {...styleProps(styles.swipeLayer)} style={{ clipPath: `inset(0 ${100 - swipe}% 0 0)` }}><img {...styleProps(styles.swipeLayerImage)} src={before} alt="Earlier version of this page" draggable={false} /></div> : null}{after ? <div {...styleProps(styles.swipeLayer)} style={{ clipPath: `inset(0 0 0 ${swipe}%)` }}><img {...styleProps(styles.swipeLayerImage)} src={after} alt="Newer version of this page" draggable={false} /></div> : null}<div {...styleProps(styles.swipeHandle)} style={{ left: `${swipe}%` }} role="slider" aria-label="Swipe position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={swipe} aria-valuetext={`${swipe}%`} tabIndex={0} onKeyDown={handleKeyDown} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd}><span {...styleProps(styles.swipeDivider)} aria-hidden="true" /></div></div>;
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
  const renderImage = (source: string | undefined, alt: string, imageStyle: TailwindClass = styles.pageImage) => source ? <img {...styleProps(imageStyle)} src={source} alt={alt} draggable={false} /> : <PaperFallback label="Preview is still rendering" />;

  if (mode === "semantic-text") return <SemanticPdfPreview page={page} zoom={zoom} selectedRegion={selectedRegion} showHighlights={showSemanticHighlights} onSelectChange={onSelectChange} />;

  const overlays = showBoundingBoxes && mode === "diff" && page.regions?.length ? <>{page.regions.map((region) => <button key={region.id} type="button" aria-label={region.label ?? `${region.kind ?? "changed"} region`} title={region.label} {...styleProps(styles.changeOverlay, region.kind === "added" && styles.changeOverlayAdded, region.kind === "removed" && styles.changeOverlayRemoved, selectedRegion === region.id && styles.changeOverlayCurrent)} onClick={() => onRegionClick(region)} style={getRegionStyle(region)} />)}</> : null;

  if (mode === "side-by-side") return <div {...styleProps(styles.paper, zoomStyle(zoom))}><div {...styleProps(styles.sideBySide)}><div {...styleProps(styles.sidePanel)}>{renderImage(before, "Earlier version of this page")}</div><div {...styleProps(styles.sidePanel)}>{renderImage(after, "Newer version of this page")}</div></div></div>;
  if (mode === "swipe") return <SwipePreview before={before} after={after} zoom={zoom} swipe={swipe} onSwipeChange={onSwipeChange} />;
  if (mode === "blink") return <div {...styleProps(styles.paper, zoomStyle(zoom))}>{renderImage(blinkOn ? after : before, blinkOn ? "Newer version of this page" : "Earlier version of this page")}<span {...styleProps(styles.blinkBadge)}>{blinkOn ? "Newer" : "Earlier"}</span></div>;
  if (mode === "earlier") return <div {...styleProps(styles.paper, zoomStyle(zoom))}>{renderImage(before, "Earlier version of this page")}</div>;
  if (mode === "newer") return <div {...styleProps(styles.paper, zoomStyle(zoom))}>{renderImage(after, "Newer version of this page")}</div>;
  return <div {...styleProps(styles.paper, zoomStyle(zoom))}>{diff ? renderImage(diff, "Visual diff of this page", styles.diffImage) : renderImage(before, "Earlier version of this page")}{!diff && page.status === "changed" ? <div {...styleProps(styles.changeOverlayLegend)}>Added · Removed</div> : null}{overlays}</div>;
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
        <header {...styleProps(styles.fullPageToolbar)}><div {...styleProps(styles.fullPageHeading)}><h2 id="full-page-viewer-title" {...styleProps(styles.fullPageTitle)}>{sourceLabel} page {pageNumber}</h2><p {...styleProps(styles.fullPageFileName)} title={fileName}>{fileName}</p></div><div {...styleProps(styles.fullPageActions)}><div {...styleProps(styles.sourceGroup)} role="group" aria-label="Source page"><button {...styleProps(styles.sourceButton, side === "earlier" && styles.modeButtonCurrent)} type="button" aria-pressed={side === "earlier"} disabled={!sourceForSide(page, "earlier")} onClick={() => onSideChange("earlier")}>Earlier</button><button {...styleProps(styles.sourceButton, side === "newer" && styles.modeButtonCurrent)} type="button" aria-pressed={side === "newer"} disabled={!sourceForSide(page, "newer")} onClick={() => onSideChange("newer")}>Newer</button></div><div {...styleProps(styles.fullPagePageNav)} aria-label={`${sourceLabel} page navigation`}><button {...styleProps(styles.iconButton)} type="button" aria-label="Previous source page" disabled={pageNumber <= 1} onClick={() => onPageChange(side, pageNumber - 2)}>←</button><span {...styleProps(styles.fullPagePagePosition)}>Page {pageNumber} / {pageCount}</span><button {...styleProps(styles.iconButton)} type="button" aria-label="Next source page" disabled={pageNumber >= pageCount} onClick={() => onPageChange(side, pageNumber)}>→</button></div><button ref={closeButtonRef} {...styleProps(styles.iconButton, styles.fullPageClose)} type="button" aria-label="Close full-page view" title="Close full-page view (Escape)" onClick={onClose}>×</button></div></header>
        <div {...styleProps(styles.fullPageStage)}><img {...styleProps(styles.fullPageImage)} src={source} alt={`${sourceLabel} version of page ${pageNumber}`} draggable={false} /></div>
        <footer {...styleProps(styles.fullPageFooter)}><span>Full-page view</span><span>Shift + ← → Earlier · Ctrl/Cmd + ← → Newer · Esc to close</span></footer>
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
      <section {...styleProps(styles.helpDialog)} role="dialog" aria-modal="true" aria-labelledby="viewer-help-title" aria-describedby="viewer-help-lead">
        <header {...styleProps(styles.helpHeader)}><div><p {...styleProps(styles.helpEyebrow)}>PDF Diff guide</p><h2 id="viewer-help-title" {...styleProps(styles.helpTitle)}>How to compare PDFs</h2><p id="viewer-help-lead" {...styleProps(styles.helpLead)}>Review the workflow, viewing modes, and keyboard shortcuts.</p></div><button ref={closeButtonRef} {...styleProps(styles.iconButton)} type="button" aria-label="Close help" onClick={onClose}>×</button></header>
        <div {...styleProps(styles.helpBody)}>
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-start"><h3 id="viewer-help-start" {...styleProps(styles.helpSectionTitle)}>In the workspace</h3><ol {...styleProps(styles.helpSteps)}>{helpSteps.map((step) => <li key={step.number} {...styleProps(styles.helpStep)}><span {...styleProps(styles.helpKey)}>{step.number}</span><h4 {...styleProps(styles.helpStepTitle)}>{step.title}</h4><p {...styleProps(styles.helpStepCopy)}>{step.copy}</p></li>)}</ol></section>
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-modes"><h3 id="viewer-help-modes" {...styleProps(styles.helpSectionTitle)}>View modes</h3><div {...styleProps(styles.helpModeList)}>{helpModes.map(([name, copy]) => <p key={name} {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>{name}</strong> — {copy}</p>)}</div></section>
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-shortcuts"><h3 id="viewer-help-shortcuts" {...styleProps(styles.helpSectionTitle)}>Shortcuts</h3><div {...styleProps(styles.helpShortcutGrid)}>{helpShortcuts.map(([shortcut, copy]) => <p key={shortcut} {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>{shortcut}</kbd><span>{copy}</span></p>)}</div></section>
          <p {...styleProps(styles.helpNote)}><strong>Settings apply when a comparison starts.</strong> The viewer displays the comparison it receives and does not perform file uploads itself.</p>
        </div>
        <footer {...styleProps(styles.helpFooter)}><span>Reusable comparison viewer</span><button {...styleProps(styles.quietButton)} type="button" onClick={onClose}>Back to app</button></footer>
      </section>
    </div>
  );
}

export function PdfDiffViewer({ comparison, onNewComparison, onAnalytics, initialOptions, onOptionsChange }: PdfDiffViewerProps) {
  const viewer = useViewerState({ comparison, initialOptions, onAnalytics });
  const {
    pages, pageIndex, mode, zoom, swipe, selectedRegion, showBoundingBoxes,
    showSemanticHighlights, blinkOn, showSettings, sensitivity, alignment,
    fullPageSide, earlierPageIndex, newerPageIndex, showHelp, earlierPageCount,
    newerPageCount, currentPage, earlierPage, newerPage, changedPages,
    fullPageIndex, fullPage, fullPageCount, previewPage, selectPage,
    goToSourcePage, changeMode, setZoom, setSwipe, setSelectedRegion,
    setShowBoundingBoxes, setShowSemanticHighlights, setShowSettings,
    setSensitivity, setAlignment, setFullPageSide, setShowHelp, goToNextChange,
  } = viewer;
  const closeHelp = () => setShowHelp(false);
  if (!currentPage || !previewPage) return null;
  const status = pageStatus(currentPage);

  return (
    <section aria-label="PDF comparison workspace">
      <WorkspaceHeader comparison={comparison} onNewComparison={onNewComparison} onHelp={() => setShowHelp(true)} />
      <div {...styleProps(styles.workspaceMain)}>
        <PageRail pages={pages} pageIndex={pageIndex} onSelectPage={selectPage} />
        <section {...styleProps(styles.canvasColumn)} aria-label="PDF comparison">
          <ViewerToolbar pageIndex={pageIndex} pageCount={pages.length} mode={mode} earlierPage={earlierPage} newerPage={newerPage} earlierPageIndex={earlierPageIndex} newerPageIndex={newerPageIndex} onPageChange={selectPage} onModeChange={changeMode} onOpenSource={setFullPageSide} zoom={zoom} onZoomChange={setZoom} />
          <div {...styleProps(styles.stage)}><div {...styleProps(styles.stageCenter)}><PagePreview page={previewPage} mode={mode} zoom={zoom} swipe={swipe} blinkOn={blinkOn} showBoundingBoxes={showBoundingBoxes} showSemanticHighlights={showSemanticHighlights} selectedRegion={selectedRegion} onRegionClick={(region) => setSelectedRegion(region.id)} onSelectChange={setSelectedRegion} onSwipeChange={setSwipe} /></div></div>
          <StatusFooter pageIndex={pageIndex} earlierPageIndex={earlierPageIndex} earlierPageCount={earlierPageCount} newerPageIndex={newerPageIndex} newerPageCount={newerPageCount} status={status} />
        </section>
        <ChangeInspector currentPage={currentPage} status={status} changedPageCount={changedPages.length} selectedRegion={selectedRegion} showBoundingBoxes={showBoundingBoxes} onShowBoundingBoxesChange={setShowBoundingBoxes} onSelectRegion={setSelectedRegion} onNextChange={goToNextChange} showSettings={showSettings} onToggleSettings={() => setShowSettings((value) => !value)} sensitivity={sensitivity} alignment={alignment} onSensitivityChange={(value) => { setSensitivity(value); onOptionsChange?.({ sensitivity: value, alignment }); }} onAlignmentChange={(value) => { setAlignment(value); onOptionsChange?.({ sensitivity, alignment: value }); }} mode={mode} swipe={swipe} onSwipeChange={setSwipe} showSemanticHighlights={showSemanticHighlights} onShowSemanticHighlightsChange={setShowSemanticHighlights} />
      </div>
      {fullPageSide && fullPage && sourceForSide(fullPage, fullPageSide) ? <FullPageViewer page={fullPage} pageNumber={fullPageIndex + 1} pageCount={fullPageCount} earlierName={comparison.earlierName} newerName={comparison.newerName} side={fullPageSide} onSideChange={setFullPageSide} onPageChange={goToSourcePage} onClose={() => setFullPageSide(null)} /> : null}
      {showHelp ? <HelpDialog onClose={closeHelp} /> : null}
    </section>
  );
}
