import { type ReactNode, useState } from "react";
import { styles, styleProps } from "./styles.js";
import type { DiffComparison, DiffPage, DiffViewMode, SourceSide } from "./types.js";
import { pagePairDescription, pagePairLabel, pageStatus, sourceForSide, statusSymbol, viewModes } from "./viewer-utils.js";
import { isNoisePage, noiseCount, summaryHeadline, type ComparisonSummary } from "./summary.js";
import type { ExportFormat } from "./export.js";

const MIN_ZOOM = 25;
const MAX_ZOOM = 400;
const ZOOM_STEP = 25;

function ThumbPlaceholder() {
  return <div {...styleProps(styles.thumbPlaceholder)} aria-hidden="true"><span {...styleProps(styles.thumbLine)} /><span {...styleProps(styles.thumbLine, styles.thumbLineShort)} /><span {...styleProps(styles.thumbDiagram)} /><span {...styleProps(styles.thumbLine, styles.thumbLineShort)} /></div>;
}

export function WorkspaceHeader({ comparison, onNewComparison, onHelp, headerActions }: { comparison: DiffComparison; onNewComparison?: () => void; onHelp: () => void; headerActions?: ReactNode }) {
  return (
    <header {...styleProps(styles.workspaceBar)}>
      <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
      <div {...styleProps(styles.documentPair)} aria-label="Compared documents"><div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>A</span><span {...styleProps(styles.documentChipName)} title={comparison.earlierName}>{comparison.earlierName}</span></div><span {...styleProps(styles.pairArrow)} aria-hidden="true">↔</span><div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>B</span><span {...styleProps(styles.documentChipName)} title={comparison.newerName}>{comparison.newerName}</span></div></div>
      <div {...styleProps(styles.workspaceActions)}>{headerActions}<button {...styleProps(styles.helpButton)} type="button" aria-haspopup="dialog" onClick={onHelp}><span {...styleProps(styles.helpButtonMark)} aria-hidden="true">?</span><span {...styleProps(styles.desktopOnly)}>Help</span></button>{onNewComparison ? <button {...styleProps(styles.quietButton)} type="button" onClick={onNewComparison}>New comparison</button> : null}</div>
    </header>
  );
}

export function SummaryBar({ summary, hideNoise, onHideNoiseChange, onlyChanged, onOnlyChangedChange, onExport }: {
  summary: ComparisonSummary;
  hideNoise: boolean;
  onHideNoiseChange: (value: boolean) => void;
  onlyChanged: boolean;
  onOnlyChangedChange: (value: boolean) => void;
  onExport?: (format: ExportFormat) => void;
}) {
  const noise = noiseCount(summary);
  return (
    <div {...styleProps(styles.summaryBar)} aria-label="Comparison summary">
      <strong {...styleProps(styles.summaryHeadline)}>{summaryHeadline(summary)}</strong>
      {summary.pagesWithUnreadableText
        ? <span {...styleProps(styles.summaryWarning)} title="The embedded font has no Unicode mapping. Text changes cannot be detected without OCR.">⚠ Text unavailable</span>
        : summary.pagesWithoutText ? <span {...styleProps(styles.summaryWarning)} title="These pages have no selectable text, so only the visual comparison applies.">⚠ No selectable text</span> : null}
      <div {...styleProps(styles.summaryFilters)}>
        {noise ? <FilterChip label="Hide reflow noise" active={hideNoise} onChange={onHideNoiseChange} /> : null}
        <FilterChip label="Only changed pages" active={onlyChanged} onChange={onOnlyChangedChange} />
        {onExport ? <ExportMenu onExport={onExport} /> : null}
      </div>
    </div>
  );
}

function ExportMenu({ onExport }: { onExport: (format: ExportFormat) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div {...styleProps(styles.exportWrap)}>
      <button {...styleProps(styles.filterChip, open && styles.filterChipOn)} type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>Export ▾</button>
      {open ? <div {...styleProps(styles.exportMenu)} role="menu">{exportOptions.map(([format, label]) => (
        <button key={format} {...styleProps(styles.exportItem)} type="button" role="menuitem" onClick={() => { onExport(format); setOpen(false); }}>{label}</button>
      ))}</div> : null}
    </div>
  );
}

const exportOptions: ReadonlyArray<readonly [ExportFormat, string]> = [
  ["text", "Change summary (.txt)"],
  ["csv", "Change list (.csv)"],
  ["json", "Full report (.json)"],
];

function FilterChip({ label, active, onChange }: { label: string; active: boolean; onChange: (value: boolean) => void }) {
  return <button {...styleProps(styles.filterChip, active && styles.filterChipOn)} type="button" aria-pressed={active} onClick={() => onChange(!active)}>{label}</button>;
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

function hiddenPageCount(pages: ReadonlyArray<DiffPage>, filters: RailFilters): number {
  return pages.length - visiblePages(pages, filters).length;
}

function pageThumbnail(page: DiffPage): string | undefined {
  return page.diffSrc ?? page.afterSrc ?? page.beforeSrc;
}

function pageStatusStyle(status: NonNullable<DiffPage["status"]>) {
  if (status === "changed") return styles.pageStatusChanged;
  if (status === "added") return styles.pageStatusAdded;
  return status === "removed" ? styles.pageStatusRemoved : undefined;
}

function PageRailItem({ page, index, selected, onSelect }: { page: DiffPage; index: number; selected: boolean; onSelect: (index: number) => void }) {
  const state = pageStatus(page);
  const thumbnail = pageThumbnail(page);
  const status = page.changedPercent ? `${page.changedPercent.toFixed(1)}%` : statusSymbol(state);
  return <button {...styleProps(styles.pageButton, selected && styles.pageButtonCurrent)} type="button" aria-label={pagePairDescription(page, index, state)} aria-current={selected ? "page" : undefined} onClick={() => onSelect(index)}><div {...styleProps(styles.pageThumb)}>{thumbnail ? <img {...styleProps(styles.pageThumbImage)} src={thumbnail} alt="Comparison overlay preview" draggable={false} /> : <ThumbPlaceholder />}{page.alignment === "moved" ? <span {...styleProps(styles.pageBadge)}>moved</span> : null}</div><div {...styleProps(styles.pageNumber)}><span>{pagePairLabel(page, index)}</span><span {...styleProps(styles.pageStatus, pageStatusStyle(state))}>{status}</span></div></button>;
}

export function PageRail({ pages, pageIndex, earlierPageIndex, newerPageIndex, earlierPageCount, newerPageCount, onSelectPage, onSourcePageChange, onlyChanged, hideNoise }: { pages: ReadonlyArray<DiffPage>; onlyChanged?: boolean; hideNoise?: boolean; pageIndex: number; earlierPageIndex: number; newerPageIndex: number; earlierPageCount: number; newerPageCount: number; onSelectPage: (index: number) => void; onSourcePageChange: (side: SourceSide, index: number) => void }) {
  if (pages.length <= 1) return null;
  return (
    <aside {...styleProps(styles.pageRail)} aria-label="Pages">
      <div {...styleProps(styles.railHeader)}>
        <h2 {...styleProps(styles.railHeading)}>Pages</h2>
        <UnifiedPageNavigation earlierPageIndex={earlierPageIndex} newerPageIndex={newerPageIndex} earlierPageCount={earlierPageCount} newerPageCount={newerPageCount} onPageChange={onSourcePageChange} />
      </div>
      {visiblePages(pages, { onlyChanged, hideNoise, pageIndex }).map(({ page, index }) => <PageRailItem key={page.index} page={page} index={index} selected={index === pageIndex} onSelect={onSelectPage} />)}
      {hiddenPageCount(pages, { onlyChanged, hideNoise, pageIndex }) ? <p {...styleProps(styles.railNote)}>{hiddenPageCount(pages, { onlyChanged, hideNoise, pageIndex })} pages hidden by filters</p> : null}
    </aside>
  );
}

export function ViewerToolbar({ mode, onModeChange, zoom, onZoomChange, earlierPage, newerPage, earlierPageIndex, newerPageIndex, onOpenSource, textUnavailable }: {
  mode: DiffViewMode;
  onModeChange: (mode: DiffViewMode) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  earlierPage: DiffPage | null;
  newerPage: DiffPage | null;
  earlierPageIndex: number;
  newerPageIndex: number;
  onOpenSource: (side: SourceSide) => void;
  textUnavailable?: boolean;
}) {
  return (
    <div {...styleProps(styles.toolbar)}>
      <div {...styleProps(styles.toolbarGroup)}>
        <div {...styleProps(styles.modeGroup)} role="toolbar" aria-label="View mode">{viewModes.map((item) => {
          const disabled = item.id === "semantic-text" && textUnavailable;
          return <button key={item.id} {...styleProps(styles.modeButton, mode === item.id && styles.modeButtonCurrent)} type="button" disabled={disabled} aria-pressed={mode === item.id} aria-keyshortcuts={item.shortcut} title={disabled ? "Text comparison unavailable: this PDF has no Unicode mapping" : `${item.label} (${item.shortcut})`} onClick={() => onModeChange(item.id)}><span {...styleProps(styles.desktopOnly)}>{item.label}</span><span {...styleProps(styles.mobileOnly)}>{item.shortcut}</span></button>;
        })}</div>
        <div {...styleProps(styles.sourceGroup)} role="group" aria-label="Open source page">
          <button {...styleProps(styles.sourceButton)} type="button" aria-label={`Open source A page ${earlierPageIndex + 1}`} title="Open source A" disabled={!sourceForSide(earlierPage, "earlier")} onClick={() => onOpenSource("earlier")}>A <span aria-hidden="true">↗</span></button>
          <button {...styleProps(styles.sourceButton)} type="button" aria-label={`Open source B page ${newerPageIndex + 1}`} title="Open source B" disabled={!sourceForSide(newerPage, "newer")} onClick={() => onOpenSource("newer")}>B <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <div {...styleProps(styles.toolbarGroup)}><button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => onZoomChange(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}>−</button><span {...styleProps(styles.zoomLabel)}>{zoom}%</span><button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => onZoomChange(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}>+</button></div>
    </div>
  );
}

export function StatusFooter({ processingProgress }: { processingProgress?: { completed: number; total: number } }) {
  if (!processingProgress) return null;
  return <div {...styleProps(styles.statusFooter)} aria-live="polite"><span {...styleProps(styles.statusAccent)}>Comparing pages · {processingProgress.completed} of {processingProgress.total} complete</span></div>;
}
