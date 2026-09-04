import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight, Download, Keyboard, Maximize2, Minimize2, RotateCcw, Settings, ZoomIn, ZoomOut } from "lucide-react";
import { styles, styleProps } from "./styles.js";
import type { CSSProperties } from "react";
import type { DiffComparison, DiffPage, DiffViewMode, OverlayStyle, SourceSide, ViewerSettings } from "./types.js";
import { MAX_ZOOM, MIN_ZOOM, pagePairDescription, pagePairLabel, pageStatus, statusSymbol, viewModes, ZOOM_STEP } from "./viewer-utils.js";
import { isNoisePage, summaryHeadline, type ComparisonSummary } from "./summary.js";
import type { ExportChoice } from "./export.js";

function ThumbPlaceholder() {
  return <div {...styleProps(styles.thumbPlaceholder)} aria-hidden="true"><span {...styleProps(styles.thumbLine)} /><span {...styleProps(styles.thumbLine, styles.thumbLineShort)} /><span {...styleProps(styles.thumbDiagram)} /><span {...styleProps(styles.thumbLine, styles.thumbLineShort)} /></div>;
}

/** The document-level answer belongs beside the document names, not in a bar of its own. */
export function WorkspaceHeader({ comparison, summary, processingProgress, onNewComparison, headerActions }: { comparison: DiffComparison; summary: ComparisonSummary; processingProgress?: { completed: number; total: number }; onNewComparison?: () => void; headerActions?: ReactNode }) {
  const headline = processingProgress
    ? `Comparing ${processingProgress.completed} of ${processingProgress.total} pages…`
    : summaryHeadline(summary);
  return (
    <header {...styleProps(styles.workspaceBar)}>
      <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span><span {...styleProps(styles.logoWord)}>pdfdiff</span></div>
      <div {...styleProps(styles.documentPair)} aria-label="Compared documents"><div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>A</span><span {...styleProps(styles.documentChipName)} title={comparison.earlierName}>{comparison.earlierName}</span></div><span {...styleProps(styles.pairArrow)} aria-hidden="true">↔</span><div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>B</span><span {...styleProps(styles.documentChipName)} title={comparison.newerName}>{comparison.newerName}</span></div></div>
      <div {...styleProps(styles.headerSummary)} aria-label="Comparison summary">
        <strong {...styleProps(styles.headerHeadline)}>{headline}</strong>
        {!processingProgress && summary.pagesWithUnreadableText
          ? <span {...styleProps(styles.headerWarning)} title="The embedded font has no Unicode mapping. Text changes cannot be detected without OCR.">⚠ Text unavailable on {summary.pagesWithUnreadableText} of {summary.pages} pages</span>
          : !processingProgress && summary.pagesWithoutText ? <span {...styleProps(styles.headerWarning)} title="These pages have no selectable text, so only the visual comparison applies.">⚠ No text on {summary.pagesWithoutText} of {summary.pages} pages</span> : null}
      </div>
      <div {...styleProps(styles.workspaceActions)}>{headerActions}{onNewComparison ? <button {...styleProps(styles.quietButton)} type="button" onClick={onNewComparison}>New comparison</button> : null}</div>
    </header>
  );
}

function ExportMenu({ onExport, canExportImage }: { onExport: (choice: ExportChoice) => void; canExportImage: boolean }) {
  const [open, setOpen] = useState(false);
  const choices = canExportImage ? exportOptions : exportOptions.filter(([choice]) => choice !== "page-image");
  return (
    <div {...styleProps(styles.exportWrap)}>
      <IconButton label="Export" active={open} icon={<Download size={16} />} onClick={() => setOpen((value) => !value)} expanded={open} />
      {open ? <div {...styleProps(styles.exportMenu)} role="menu">{choices.map(([choice, label]) => (
        <button key={choice} {...styleProps(styles.exportItem)} type="button" role="menuitem" onClick={() => { onExport(choice); setOpen(false); }}>{label}</button>
      ))}</div> : null}
    </div>
  );
}

const exportOptions: ReadonlyArray<readonly [ExportChoice, string]> = [
  ["page-image", "This page's diff image (.png)"],
  ["text", "Change summary (.txt)"],
  ["csv", "Change list (.csv)"],
  ["json", "Full report (.json)"],
];

function IconButton({ label, icon, onClick, disabled, active, expanded, desktopOnly }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; expanded?: boolean; desktopOnly?: boolean }) {
  return <button {...styleProps(styles.iconButton, active && styles.modeButtonCurrent, desktopOnly && styles.toolbarDesktopOnly)} type="button" aria-label={label} title={label} disabled={disabled} aria-expanded={expanded} aria-haspopup={expanded === undefined ? undefined : "menu"} onClick={onClick}>{icon}</button>;
}

function UnifiedPageNavigation({ earlierPageIndex, newerPageIndex, earlierPageCount, newerPageCount, onPageChange }: { earlierPageIndex: number; newerPageIndex: number; earlierPageCount: number; newerPageCount: number; onPageChange: (side: SourceSide, index: number) => void }) {
  const pageRow = (side: SourceSide, pageIndex: number, pageCount: number) => {
    const shortLabel = side === "earlier" ? "A" : "B";
    const sourceLabel = side === "earlier" ? "source A" : "source B";
    return <div {...styleProps(styles.unifiedPageRow)}><button {...styleProps(styles.railPageButton)} type="button" aria-label={`Previous ${sourceLabel} page`} disabled={pageIndex === 0} onClick={() => onPageChange(side, pageIndex - 1)}>←</button><span {...styleProps(styles.unifiedPagePosition)} aria-live="polite"><span {...styleProps(styles.unifiedPageLabel)}>{shortLabel}</span><strong>{pageCount ? `${pageIndex + 1} / ${pageCount}` : "—"}</strong></span><button {...styleProps(styles.railPageButton)} type="button" aria-label={`Next ${sourceLabel} page`} disabled={pageIndex >= pageCount - 1} onClick={() => onPageChange(side, pageIndex + 1)}>→</button></div>;
  };
  return <div {...styleProps(styles.unifiedPageNavigation)} role="group" aria-label="Independent PDF page navigation">{pageRow("earlier", earlierPageIndex, earlierPageCount)}{pageRow("newer", newerPageIndex, newerPageCount)}</div>;
}

interface RailFilters {
  readonly onlyChanged?: boolean;
  readonly hideNoise?: boolean;
  readonly pageIndex: number;
}

/** The selected page always stays in the rail so a filter never strips the view out from under it. */
function railPageVisible(page: DiffPage, index: number, filters: RailFilters): boolean {
  if (index === filters.pageIndex) return true;
  const status = pageStatus(page);
  if (filters.hideNoise && isNoisePage(page)) return false;
  return !filters.onlyChanged || status !== "same";
}

function visiblePages(pages: ReadonlyArray<DiffPage>, filters: RailFilters): Array<{ page: DiffPage; index: number }> {
  return pages.map((page, index) => ({ page, index })).filter(({ page, index }) => railPageVisible(page, index, filters));
}

function pageThumbnail(page: DiffPage): string | undefined {
  return page.diffSrc ?? page.afterSrc ?? page.beforeSrc;
}

function pageStatusStyle(status: NonNullable<DiffPage["status"]>) {
  if (status === "same") return styles.pageStatusSame;
  if (status === "changed") return styles.pageStatusChanged;
  if (status === "added") return styles.pageStatusAdded;
  return status === "removed" ? styles.pageStatusRemoved : undefined;
}

function PageRailItem({ page, index, selected, onSelect }: { page: DiffPage; index: number; selected: boolean; onSelect: (index: number) => void }) {
  const state = pageStatus(page);
  const thumbnail = pageThumbnail(page);
  const status = page.changedPercent ? `${page.changedPercent.toFixed(1)}%` : statusSymbol(state);
  return <button {...styleProps(styles.pageButton, selected && styles.pageButtonCurrent)} type="button" aria-label={pagePairDescription(page, index, state)} aria-current={selected ? "page" : undefined} onClick={() => onSelect(index)}><div {...styleProps(styles.pageThumb)}>{thumbnail ? <img {...styleProps(styles.pageThumbImage)} src={thumbnail} alt="Comparison overlay preview" loading="lazy" decoding="async" draggable={false} /> : <ThumbPlaceholder />}{page.alignment === "moved" ? <span {...styleProps(styles.pageBadge)}>moved</span> : null}</div><div {...styleProps(styles.pageNumber)}><span>{pagePairLabel(page, index)}</span><span {...styleProps(styles.pageStatus, pageStatusStyle(state))}>{status}</span></div></button>;
}

export function PageRail({ pages, pageIndex, earlierPageIndex, newerPageIndex, earlierPageCount, newerPageCount, onSelectPage, onSourcePageChange, onlyChanged, hideNoise }: { pages: ReadonlyArray<DiffPage>; onlyChanged?: boolean; hideNoise?: boolean; pageIndex: number; earlierPageIndex: number; newerPageIndex: number; earlierPageCount: number; newerPageCount: number; onSelectPage: (index: number) => void; onSourcePageChange: (side: SourceSide, index: number) => void }) {
  const visible = useMemo(
    () => visiblePages(pages, { onlyChanged, hideNoise, pageIndex }),
    [pages, onlyChanged, hideNoise, pageIndex],
  );
  if (pages.length <= 1) return null;
  const hidden = pages.length - visible.length;
  return (
    <aside {...styleProps(styles.pageRail)} aria-label="Pages">
      <div {...styleProps(styles.railHeader)}>
        <h2 {...styleProps(styles.railHeading)}>Pages</h2>
        <UnifiedPageNavigation earlierPageIndex={earlierPageIndex} newerPageIndex={newerPageIndex} earlierPageCount={earlierPageCount} newerPageCount={newerPageCount} onPageChange={onSourcePageChange} />
      </div>
      {visible.map(({ page, index }) => <PageRailItem key={page.index} page={page} index={index} selected={index === pageIndex} onSelect={onSelectPage} />)}
      {hidden ? <p {...styleProps(styles.railNote)}>{hidden} pages hidden by filters</p> : null}
    </aside>
  );
}

export function ViewerToolbar({ mode, onModeChange, zoom, onZoomChange, textUnavailable, isFullscreen, onToggleFullscreen, onSettings, onHelp, onExport, canExportImage, onStepChange, hasChanges }: {
  mode: DiffViewMode;
  onModeChange: (mode: DiffViewMode) => void;
  onStepChange: (direction: 1 | -1) => void;
  hasChanges: boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  textUnavailable?: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onExport?: (choice: ExportChoice) => void;
  canExportImage: boolean;
}) {
  return (
    <div {...styleProps(styles.toolbar)}>
      <div {...styleProps(styles.modeGroup)} role="toolbar" aria-label="View mode">{viewModes.map((item) => {
        const disabled = item.id === "semantic-text" && textUnavailable;
        return <button key={item.id} {...styleProps(styles.modeButton, mode === item.id && styles.modeButtonCurrent)} type="button" disabled={disabled} aria-pressed={mode === item.id} aria-keyshortcuts={item.shortcut} title={disabled ? "Text comparison unavailable: this PDF has no Unicode mapping" : `${item.label} (${item.shortcut})`} onClick={() => onModeChange(item.id)}>{item.label}</button>;
      })}</div>
      <div {...styleProps(styles.toolbarGroup)}>
        <IconButton label="Previous change" icon={<ChevronsLeft size={16} />} disabled={!hasChanges} onClick={() => onStepChange(-1)} />
        <IconButton label="Next change" icon={<ChevronsRight size={16} />} disabled={!hasChanges} onClick={() => onStepChange(1)} />
        <span {...styleProps(styles.toolbarDivider)} aria-hidden="true" />
        <IconButton label="Zoom out" icon={<ZoomOut size={16} />} disabled={zoom <= MIN_ZOOM} onClick={() => onZoomChange(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))} />
        <span {...styleProps(styles.zoomLabel)}>{zoom}%</span>
        <IconButton label="Zoom in" icon={<ZoomIn size={16} />} disabled={zoom >= MAX_ZOOM} onClick={() => onZoomChange(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))} />
        <IconButton desktopOnly label="Reset zoom" icon={<RotateCcw size={16} />} disabled={zoom === 100} onClick={() => onZoomChange(100)} />
        <IconButton desktopOnly label="Fullscreen" icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />} onClick={onToggleFullscreen} />
        <IconButton label="Settings" icon={<Settings size={16} />} onClick={onSettings} />
        <IconButton desktopOnly label="Keyboard shortcuts" icon={<Keyboard size={16} />} onClick={onHelp} />
        {onExport ? <ExportMenu onExport={onExport} canExportImage={canExportImage} /> : null}
      </div>
    </div>
  );
}

export function StatusFooter({ processingProgress }: { processingProgress?: { completed: number; total: number } }) {
  if (!processingProgress) return null;
  const percent = processingProgress.total ? Math.round(processingProgress.completed / processingProgress.total * 100) : 0;
  return <div {...styleProps(styles.statusFooter)} aria-live="polite"><div {...styleProps(styles.statusProgress)} role="progressbar" aria-label="Comparison progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div {...styleProps(styles.statusProgressFill)} style={{ width: `${percent}%` }} /></div><span {...styleProps(styles.statusAccent)}>Comparing page {Math.min(processingProgress.completed + 1, processingProgress.total)} of {processingProgress.total}</span><span>{percent}%</span></div>;
}

function SettingsCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label {...styleProps(styles.settingsRow)}>{label}<input {...styleProps(styles.settingsCheckbox)} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

/** Appearance and filters, plus the one control that does re-run the comparison. */
export function SettingsDialog({ overlay, onOverlayChange, settings, onSettingsChange, matchPages, onMatchPagesChange, onClose }: {
  overlay: OverlayStyle;
  onOverlayChange: (overlay: OverlayStyle) => void;
  settings: ViewerSettings;
  onSettingsChange: (settings: ViewerSettings) => void;
  matchPages?: boolean;
  onMatchPagesChange?: (matchPages: boolean) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const update = <Key extends keyof ViewerSettings>(key: Key, value: ViewerSettings[Key]) => onSettingsChange({ ...settings, [key]: value });
  useEffect(() => closeButtonRef.current?.focus(), []);
  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);
  return (
    <div {...styleProps(styles.dialogBackdrop)} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section {...styleProps(styles.settingsDialog)} role="dialog" aria-modal="true" aria-labelledby="viewer-settings-title">
        <header {...styleProps(styles.helpHeader)}><h2 id="viewer-settings-title" {...styleProps(styles.helpTitle)}>Settings</h2><button ref={closeButtonRef} {...styleProps(styles.iconButton)} type="button" aria-label="Close settings" onClick={onClose}>×</button></header>
        <div {...styleProps(styles.settingsBody)}>
          <section {...styleProps(styles.settingsGroup)}>
            <h3 {...styleProps(styles.settingsGroupTitle)}>Overlay colours</h3>
            <label {...styleProps(styles.settingsRow)}>Newer content<input {...styleProps(styles.overlaySwatch)} type="color" value={overlay.addedColor} aria-label="Colour for newer content" onChange={(event) => onOverlayChange({ ...overlay, addedColor: event.target.value })} /></label>
            <label {...styleProps(styles.settingsRow)}>Earlier content<input {...styleProps(styles.overlaySwatch)} type="color" value={overlay.removedColor} aria-label="Colour for earlier content" onChange={(event) => onOverlayChange({ ...overlay, removedColor: event.target.value })} /></label>
            <label {...styleProps(styles.settingsRow)}>Modified content<input {...styleProps(styles.overlaySwatch)} type="color" value={overlay.modifiedColor} aria-label="Colour for modified content" onChange={(event) => onOverlayChange({ ...overlay, modifiedColor: event.target.value })} /></label>
            <label {...styleProps(styles.settingsRow)}>Unchanged {Math.round(overlay.unchangedOpacity * 100)}%<input {...styleProps(styles.overlayRange)} style={{ "--range-fill": `${Math.round(overlay.unchangedOpacity * 100)}%` } as CSSProperties} type="range" min={0} max={100} value={Math.round(overlay.unchangedOpacity * 100)} aria-label="How strongly unchanged content shows through" onChange={(event) => onOverlayChange({ ...overlay, unchangedOpacity: Number(event.target.value) / 100 })} /></label>
          </section>
          <section {...styleProps(styles.settingsGroup)}>
            <h3 {...styleProps(styles.settingsGroupTitle)}>View</h3>
            <SettingsCheckbox label="Outline changed regions" checked={settings.showBoundingBoxes} onChange={(value) => update("showBoundingBoxes", value)} />
            <SettingsCheckbox label="Hide reflow noise" checked={settings.hideNoise} onChange={(value) => update("hideNoise", value)} />
            <SettingsCheckbox label="Only changed pages" checked={settings.onlyChanged} onChange={(value) => update("onlyChanged", value)} />
          </section>
          {onMatchPagesChange ? (
            <section {...styleProps(styles.settingsGroup)}>
              <h3 {...styleProps(styles.settingsGroupTitle)}>Comparison</h3>
              <SettingsCheckbox label="Match pages automatically" checked={matchPages !== false} onChange={onMatchPagesChange} />
              <p {...styleProps(styles.settingsNote)}>Pairs pages by content so inserted or removed pages stay aligned. Off compares page 1 with page 1. Changing this compares the PDFs again.</p>
            </section>
          ) : null}
        </div>
        <footer {...styleProps(styles.helpFooter)}><button {...styleProps(styles.quietButton)} type="button" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );
}
