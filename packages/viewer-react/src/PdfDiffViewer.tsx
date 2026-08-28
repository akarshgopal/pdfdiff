import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { styles, styleProps, type TailwindClass } from "./styles.js";
import type { DiffPage, DiffRegion, DiffSemanticOverlay, DiffViewMode, PdfDiffViewerProps, SourceSide } from "./types.js";

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

function zoomStyle(zoom: number): TailwindClass {
  return styles[`paperZoom${zoom}` as keyof typeof styles] as TailwindClass;
}

function swipeStyle(value: number): TailwindClass {
  const rounded = Math.min(100, Math.max(0, Math.round(value / 10) * 10));
  return styles[`swipe${rounded}` as keyof typeof styles] as TailwindClass;
}

function getRegionStyle(region: DiffRegion): CSSProperties {
  return {
    left: `${Math.max(0, Math.min(100, region.x))}%`,
    top: `${Math.max(0, Math.min(100, region.y))}%`,
    width: `${Math.max(0.5, Math.min(100, region.width))}%`,
    height: `${Math.max(0.5, Math.min(100, region.height))}%`,
  };
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

  const setSwipeFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const paper = event.currentTarget.parentElement;
    if (!paper) return;
    const bounds = paper.getBoundingClientRect();
    onSwipeChange(Math.round(Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100))));
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
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleSwipeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") { event.preventDefault(); onSwipeChange(Math.max(0, swipe - step)); }
    else if (event.key === "ArrowRight") { event.preventDefault(); onSwipeChange(Math.min(100, swipe + step)); }
    else if (event.key === "Home") { event.preventDefault(); onSwipeChange(0); }
    else if (event.key === "End") { event.preventDefault(); onSwipeChange(100); }
  };

  if (mode === "side-by-side") return <div {...styleProps(styles.paper, zoomStyle(zoom))}><div {...styleProps(styles.sideBySide)}><div {...styleProps(styles.sidePanel)}>{renderImage(before, "Earlier version of this page")}</div><div {...styleProps(styles.sidePanel)}>{renderImage(after, "Newer version of this page")}</div></div></div>;
  if (mode === "swipe") return <div {...styleProps(styles.paper, styles.swipeWrap, zoomStyle(zoom))}>{renderImage(before, "Earlier version of this page")}{after ? <img {...styleProps(styles.swipeNewer, swipeStyle(swipe))} src={after} alt="Newer version of this page" draggable={false} /> : null}<div {...styleProps(styles.swipeHandle)} style={{ left: `${swipe}%` }} role="slider" aria-label="Swipe position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={swipe} aria-valuetext={`${swipe}%`} tabIndex={0} onKeyDown={handleSwipeKeyDown} onPointerDown={handleSwipePointerDown} onPointerMove={handleSwipePointerMove} onPointerUp={handleSwipePointerEnd} onPointerCancel={handleSwipePointerEnd}><span {...styleProps(styles.swipeDivider)} aria-hidden="true" /></div></div>;
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
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-start"><h3 id="viewer-help-start" {...styleProps(styles.helpSectionTitle)}>In the workspace</h3><ol {...styleProps(styles.helpSteps)}><li {...styleProps(styles.helpStep)}><span {...styleProps(styles.helpKey)}>1</span><h4 {...styleProps(styles.helpStepTitle)}>Pick a page</h4><p {...styleProps(styles.helpStepCopy)}>Use the page rail or the page arrows to move through the comparison.</p></li><li {...styleProps(styles.helpStep)}><span {...styleProps(styles.helpKey)}>2</span><h4 {...styleProps(styles.helpStepTitle)}>Choose a view</h4><p {...styleProps(styles.helpStepCopy)}>Use Diff, Semantic text, Side by side, Swipe, Blink, Earlier, or Newer.</p></li><li {...styleProps(styles.helpStep)}><span {...styleProps(styles.helpKey)}>3</span><h4 {...styleProps(styles.helpStepTitle)}>Inspect changes</h4><p {...styleProps(styles.helpStepCopy)}>Select a region or text change, toggle highlights, and move to the next changed page.</p></li></ol></section>
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-modes"><h3 id="viewer-help-modes" {...styleProps(styles.helpSectionTitle)}>View modes</h3><div {...styleProps(styles.helpModeList)}><p {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>Semantic text</strong> — native PDF pages with anchored text highlights.</p><p {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>Diff</strong> — visual change overlay.</p><p {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>Side by side</strong> — compare both pages together.</p><p {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>Swipe / Blink</strong> — reveal or alternate between versions.</p><p {...styleProps(styles.helpMode)}><strong {...styleProps(styles.helpModeName)}>Earlier / Newer</strong> — inspect one source page.</p></div></section>
          <section {...styleProps(styles.helpSection)} aria-labelledby="viewer-help-shortcuts"><h3 id="viewer-help-shortcuts" {...styleProps(styles.helpSectionTitle)}>Shortcuts</h3><div {...styleProps(styles.helpShortcutGrid)}><p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>← →</kbd><span>Comparison pages</span></p><p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>1–7</kbd><span>View modes</span></p><p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>J / N</kbd><span>Next page; K / P goes back</span></p><p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>M</kbd><span>Cycle modes</span></p><p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>Shift + ← →</kbd><span>Earlier source pages</span></p><p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>Ctrl/Cmd + ← →</kbd><span>Newer source pages</span></p><p {...styleProps(styles.helpShortcut)}><kbd {...styleProps(styles.helpKey)}>Esc</kbd><span>Close or clear selection</span></p></div></section>
          <p {...styleProps(styles.helpNote)}><strong>Settings apply when a comparison starts.</strong> The viewer displays the comparison it receives and does not perform file uploads itself.</p>
        </div>
        <footer {...styleProps(styles.helpFooter)}><span>Reusable comparison viewer</span><button {...styleProps(styles.quietButton)} type="button" onClick={onClose}>Back to app</button></footer>
      </section>
    </div>
  );
}

export function PdfDiffViewer({ comparison, onNewComparison, onAnalytics, initialOptions, onOptionsChange }: PdfDiffViewerProps) {
  const pages = useMemo(() => comparison.pages, [comparison]);
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<DiffViewMode>("diff");
  const [zoom, setZoom] = useState<number>(100);
  const [swipe, setSwipe] = useState(50);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [showSemanticHighlights, setShowSemanticHighlights] = useState(true);
  const [blinkOn, setBlinkOn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sensitivity, setSensitivity] = useState(initialOptions?.sensitivity ?? 28);
  const [alignment, setAlignment] = useState<"none" | "translation">(initialOptions?.alignment ?? "none");
  const [fullPageSide, setFullPageSide] = useState<SourceSide | null>(null);
  const [earlierPageIndex, setEarlierPageIndex] = useState(0);
  const [newerPageIndex, setNewerPageIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const earlierPageCount = useMemo(() => sourcePageCount(pages, "earlier"), [pages]);
  const newerPageCount = useMemo(() => sourcePageCount(pages, "newer"), [pages]);
  const currentPage = pages[pageIndex] ?? null;
  const earlierPage = pages[earlierPageIndex] ?? null;
  const newerPage = pages[newerPageIndex] ?? null;
  const changedPages = useMemo(() => pages.filter((page) => pageStatus(page) !== "same"), [pages]);
  const fullPageIndex = fullPageSide === "earlier" ? earlierPageIndex : newerPageIndex;
  const fullPage = fullPageSide === "earlier" ? earlierPage : newerPage;
  const fullPageCount = fullPageSide === "earlier" ? earlierPageCount : newerPageCount;
  const closeHelp = useCallback(() => setShowHelp(false), []);

  const selectPage = useCallback((index: number) => {
    const nextIndex = clampPageIndex(index, pages.length);
    setPageIndex(nextIndex);
    setEarlierPageIndex(clampPageIndex(nextIndex, earlierPageCount));
    setNewerPageIndex(clampPageIndex(nextIndex, newerPageCount));
    setSelectedRegion(null);
  }, [earlierPageCount, newerPageCount, pages.length]);

  const goToSourcePage = useCallback((side: SourceSide, index: number) => {
    if (side === "earlier") setEarlierPageIndex(clampPageIndex(index, earlierPageCount));
    else setNewerPageIndex(clampPageIndex(index, newerPageCount));
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
    const currentIndex = viewModes.findIndex((item) => item.id === mode);
    changeMode(viewModes[(currentIndex + direction + viewModes.length) % viewModes.length]!.id);
  }, [changeMode, mode]);

  useEffect(() => {
    if (mode !== "blink") return;
    const timer = window.setInterval(() => setBlinkOn((value) => !value), 720);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (showHelp) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.isContentEditable || target?.getAttribute("role") === "slider") return;
      if (event.key === "Escape" && fullPageSide) { event.preventDefault(); setFullPageSide(null); return; }
      const next = event.key === "ArrowRight" || event.key === "PageDown" || event.key.toLowerCase() === "j" || event.key.toLowerCase() === "n";
      const previous = event.key === "ArrowLeft" || event.key === "PageUp" || event.key.toLowerCase() === "k" || event.key.toLowerCase() === "p";
      if (next || previous) {
        event.preventDefault();
        const direction = next ? 1 : -1;
        const sourceSide = event.shiftKey ? "earlier" : event.ctrlKey || event.metaKey ? "newer" : fullPageSide;
        if (sourceSide) stepSourcePage(sourceSide, direction);
        else selectPage(pageIndex + direction);
        return;
      }
      const numberMode = viewModes.find((item) => item.shortcut === event.key);
      if (numberMode) { event.preventDefault(); changeMode(numberMode.id); }
      else if (event.key === "[" || event.key === "{") { event.preventDefault(); cycleMode(-1); }
      else if (event.key === "]" || event.key === "}") { event.preventDefault(); cycleMode(1); }
      else if (event.key.toLowerCase() === "m") { event.preventDefault(); cycleMode(event.shiftKey ? -1 : 1); }
      else if (event.key === "Home") { event.preventDefault(); const sourceSide = event.shiftKey ? "earlier" : event.ctrlKey || event.metaKey ? "newer" : fullPageSide; if (sourceSide) goToSourcePage(sourceSide, 0); else selectPage(0); }
      else if (event.key === "End") { event.preventDefault(); const sourceSide = event.shiftKey ? "earlier" : event.ctrlKey || event.metaKey ? "newer" : fullPageSide; if (sourceSide) goToSourcePage(sourceSide, sourceSide === "earlier" ? earlierPageCount - 1 : newerPageCount - 1); else selectPage(pages.length - 1); }
      else if (event.key === "Escape") setSelectedRegion(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeMode, cycleMode, earlierPageCount, fullPageSide, goToSourcePage, newerPageCount, pageIndex, pages.length, selectPage, showHelp, stepSourcePage]);

  if (!currentPage) return null;
  const status = pageStatus(currentPage);
  const previewPage = mode === "diff" || mode === "semantic-text" ? currentPage : { ...currentPage, beforeSrc: earlierPage?.beforeSrc, afterSrc: newerPage?.afterSrc };
  const goToNextChange = () => {
    const next = pages.findIndex((page, index) => index > pageIndex && pageStatus(page) !== "same");
    const fallback = pages.findIndex((page) => pageStatus(page) !== "same");
    selectPage(next >= 0 ? next : fallback >= 0 ? fallback : pageIndex);
  };

  return (
    <section aria-label="PDF comparison workspace">
      <header {...styleProps(styles.workspaceBar)}>
        <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
        <div {...styleProps(styles.documentPair)} aria-label="Compared documents"><div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>A</span><span {...styleProps(styles.documentChipName)} title={comparison.earlierName}>{comparison.earlierName}</span></div><span {...styleProps(styles.pairArrow)} aria-hidden="true">↔</span><div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>B</span><span {...styleProps(styles.documentChipName)} title={comparison.newerName}>{comparison.newerName}</span></div></div>
        <div {...styleProps(styles.workspaceActions)}><button {...styleProps(styles.helpButton)} type="button" aria-haspopup="dialog" onClick={() => setShowHelp(true)}><span {...styleProps(styles.helpButtonMark)} aria-hidden="true">?</span><span {...styleProps(styles.desktopOnly)}>Help</span></button>{onNewComparison ? <button {...styleProps(styles.quietButton)} type="button" onClick={onNewComparison}>New comparison</button> : null}</div>
      </header>
      <div {...styleProps(styles.workspaceMain)}>
        <aside {...styleProps(styles.pageRail)} aria-label="Pages"><h2 {...styleProps(styles.railHeading)}>Pages <span aria-hidden="true">·</span> {pages.length}</h2>{pages.map((page, index) => { const pageState = pageStatus(page); return <button key={page.index ?? index} {...styleProps(styles.pageButton, index === pageIndex && styles.pageButtonCurrent)} type="button" aria-label={`Page ${index + 1}, ${statusLabel(pageState)}`} aria-current={index === pageIndex ? "page" : undefined} onClick={() => selectPage(index)}><div {...styleProps(styles.pageThumb)}>{page.beforeSrc || page.afterSrc ? <img {...styleProps(styles.pageThumbImage)} src={page.beforeSrc ?? page.afterSrc} alt="" draggable={false} /> : <ThumbPlaceholder />}</div><div {...styleProps(styles.pageNumber)}><span>{index + 1}</span><span {...styleProps(styles.pageStatus, pageState === "changed" && styles.pageStatusChanged, pageState === "added" && styles.pageStatusAdded, pageState === "removed" && styles.pageStatusRemoved)}>{statusSymbol(pageState)}</span></div></button>; })}</aside>
        <section {...styleProps(styles.canvasColumn)} aria-label="PDF comparison">
          <div {...styleProps(styles.toolbar)}><div {...styleProps(styles.toolbarGroup)}><button {...styleProps(styles.iconButton)} type="button" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => selectPage(pageIndex - 1)}>←</button><span {...styleProps(styles.zoomLabel)}>{pageIndex + 1} / {pages.length}</span><button {...styleProps(styles.iconButton)} type="button" aria-label="Next page" disabled={pageIndex >= pages.length - 1} onClick={() => selectPage(pageIndex + 1)}>→</button></div><div {...styleProps(styles.modeGroup)} role="toolbar" aria-label="View mode">{viewModes.map((item) => <button key={item.id} {...styleProps(styles.modeButton, mode === item.id && styles.modeButtonCurrent)} type="button" aria-pressed={mode === item.id} aria-keyshortcuts={item.shortcut} title={`${item.label} (${item.shortcut})`} onClick={() => changeMode(item.id)}><span {...styleProps(styles.desktopOnly)}>{item.label}</span><span {...styleProps(styles.mobileOnly)}>{item.shortcut}</span></button>)}</div><div {...styleProps(styles.sourceGroup)} role="group" aria-label="Open source page full screen"><button {...styleProps(styles.sourceButton)} type="button" aria-label={`Open earlier version of page ${earlierPageIndex + 1} full screen`} disabled={!sourceForSide(earlierPage, "earlier")} onClick={() => setFullPageSide("earlier")}><span aria-hidden="true">↗</span><span {...styleProps(styles.desktopOnly)}>Earlier</span><span {...styleProps(styles.mobileOnly)}>A</span></button><button {...styleProps(styles.sourceButton)} type="button" aria-label={`Open newer version of page ${newerPageIndex + 1} full screen`} disabled={!sourceForSide(newerPage, "newer")} onClick={() => setFullPageSide("newer")}><span aria-hidden="true">↗</span><span {...styleProps(styles.desktopOnly)}>Newer</span><span {...styleProps(styles.mobileOnly)}>B</span></button></div><div {...styleProps(styles.toolbarGroup)}><button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom out" disabled={zoom === zoomLevels[0]} onClick={() => setZoom((value) => zoomLevels[Math.max(0, zoomLevels.indexOf(value as (typeof zoomLevels)[number]) - 1)] ?? 50)}>−</button><span {...styleProps(styles.zoomLabel)}>{zoom}%</span><button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom in" disabled={zoom === zoomLevels[zoomLevels.length - 1]} onClick={() => setZoom((value) => zoomLevels[Math.min(zoomLevels.length - 1, zoomLevels.indexOf(value as (typeof zoomLevels)[number]) + 1)] ?? 200)}>+</button></div></div>
          <div {...styleProps(styles.stage)}><div {...styleProps(styles.stageCenter)}><PagePreview page={previewPage} mode={mode} zoom={zoom} swipe={swipe} blinkOn={blinkOn} showBoundingBoxes={showBoundingBoxes} showSemanticHighlights={showSemanticHighlights} selectedRegion={selectedRegion} onRegionClick={(region) => setSelectedRegion(region.id)} onSelectChange={setSelectedRegion} onSwipeChange={setSwipe} /></div></div>
          <div {...styleProps(styles.statusFooter)}><span><span {...styleProps(styles.statusAccent)}>{status === "same" ? "No visual changes" : statusLabel(status)}</span> · page {pageIndex + 1}</span><span>A page {earlierPageIndex + 1}/{earlierPageCount} · B page {newerPageIndex + 1}/{newerPageCount}</span><span {...styleProps(styles.shortcutHint)} title="Keyboard shortcuts">← → pages · Shift + ← → A · Ctrl/Cmd + ← → B · 1–7 modes</span></div>
        </section>
        <aside {...styleProps(styles.inspector)} aria-label="Change inspector"><h2 {...styleProps(styles.inspectorHeading)}>Change inspector</h2><p {...styleProps(styles.inspectorSubheading)}>Select a change to locate it on the page.</p><div {...styleProps(styles.changeSummary)}><div {...styleProps(styles.statCard)}><span {...styleProps(styles.statLabel)}>Changed pages</span><strong {...styleProps(styles.statValue, changedPages.length > 0 && styles.statValueWarm)}>{changedPages.length}</strong></div><div {...styleProps(styles.statCard)}><span {...styleProps(styles.statLabel)}>Changed area</span><strong {...styleProps(styles.statValue, (currentPage.changedPercent ?? 0) > 0 && styles.statValueWarm)}>{currentPage.changedPercent ? `${currentPage.changedPercent.toFixed(2)}%` : "—"}</strong></div></div><button {...styleProps(styles.actionButton)} type="button" onClick={goToNextChange}>Next changed page <span aria-hidden="true">→</span></button><div {...styleProps(styles.inspectorSection)}><div {...styleProps(styles.sectionLabel)}><span>Regions</span><span>{currentPage.regions?.length ?? 0}</span></div><label {...styleProps(styles.switchRow)}><span {...styleProps(styles.switchLabel)}>Show bounding boxes</span><span {...styleProps(styles.switch, showBoundingBoxes && styles.switchOn)}><input type="checkbox" role="switch" aria-checked={showBoundingBoxes} checked={showBoundingBoxes} onChange={(event) => setShowBoundingBoxes(event.target.checked)} {...styleProps(styles.switchInput)} /><span {...styleProps(styles.switchThumb, showBoundingBoxes && styles.switchThumbOn)} aria-hidden="true" /></span></label>{currentPage.regions?.length ? <div {...styleProps(styles.changeList)}>{currentPage.regions.map((region, index) => <button key={region.id} {...styleProps(styles.changeButton, selectedRegion === region.id && styles.changeButtonCurrent)} type="button" onClick={() => setSelectedRegion(region.id)}><span {...styleProps(styles.changeDot, region.kind === "added" && styles.changeDotAdded, region.kind === "removed" && styles.changeDotRemoved)} aria-hidden="true" /><span {...styleProps(styles.changeText)}>{region.label ?? `${region.kind ?? "Changed"} region ${index + 1}`}</span><span {...styleProps(styles.changeCount)}>#{index + 1}</span></button>)}</div> : <div {...styleProps(styles.emptyChanges)}>{status === "same" ? "No regions on this page." : "No regions to inspect."}</div>}</div>{currentPage.textChanges?.length ? <div {...styleProps(styles.inspectorSection)}><div {...styleProps(styles.sectionLabel)}><span>Text changes</span><span>{currentPage.textChanges.length}</span></div><div {...styleProps(styles.changeList)}>{currentPage.textChanges.slice(0, 6).map((change) => <button key={change.id} {...styleProps(styles.changeButton, selectedRegion === change.id && styles.changeButtonCurrent)} type="button" onClick={() => setSelectedRegion(change.id)}><span {...styleProps(styles.changeDot, change.kind === "added" && styles.changeDotAdded, change.kind === "removed" && styles.changeDotRemoved)} aria-hidden="true" /><span {...styleProps(styles.changeText)}>{change.text}</span></button>)}</div></div> : null}<div {...styleProps(styles.inspectorSection)}><button {...styleProps(styles.quietButton)} type="button" aria-expanded={showSettings} onClick={() => setShowSettings((value) => !value)}>{showSettings ? "Hide comparison settings" : "Comparison settings"}</button>{showSettings ? <div {...styleProps(styles.inspectorSection)}><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="sensitivity">Sensitivity</label><span {...styleProps(styles.controlValue)}>{sensitivity}</span></div><input id="sensitivity" {...styleProps(styles.range)} type="range" min="0" max="100" value={sensitivity} onChange={(event) => { const next = Number(event.target.value); setSensitivity(next); onOptionsChange?.({ sensitivity: next, alignment }); }} /><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="alignment">Alignment</label><select id="alignment" {...styleProps(styles.select)} value={alignment} onChange={(event) => { const next = event.target.value as "none" | "translation"; setAlignment(next); onOptionsChange?.({ sensitivity, alignment: next }); }}><option value="none">None</option><option value="translation">Translation only</option></select></div>{mode === "swipe" ? <><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="swipe">Swipe position</label><span {...styleProps(styles.controlValue)}>{swipe}%</span></div><input id="swipe" {...styleProps(styles.range)} type="range" min="0" max="100" value={swipe} onChange={(event) => setSwipe(Number(event.target.value))} /></> : null}</div> : null}</div><div {...styleProps(styles.inspectorSection)}><label {...styleProps(styles.switchRow)}><span {...styleProps(styles.switchLabel)}>Semantic highlights</span><span {...styleProps(styles.switch, showSemanticHighlights && styles.switchOn)}><input type="checkbox" role="switch" aria-checked={showSemanticHighlights} checked={showSemanticHighlights} onChange={(event) => setShowSemanticHighlights(event.target.checked)} {...styleProps(styles.switchInput)} /><span {...styleProps(styles.switchThumb, showSemanticHighlights && styles.switchThumbOn)} aria-hidden="true" /></span></label></div></aside>
      </div>
      {fullPageSide && fullPage && sourceForSide(fullPage, fullPageSide) ? <FullPageViewer page={fullPage} pageNumber={fullPageIndex + 1} pageCount={fullPageCount} earlierName={comparison.earlierName} newerName={comparison.newerName} side={fullPageSide} onSideChange={setFullPageSide} onPageChange={goToSourcePage} onClose={() => setFullPageSide(null)} /> : null}
      {showHelp ? <HelpDialog onClose={closeHelp} /> : null}
    </section>
  );
}
