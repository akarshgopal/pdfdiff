/* The reusable package cannot depend on Next.js's Image component. */
/* eslint-disable @next/next/no-img-element */
import { styles, styleProps } from "./styles.js";
import type { DiffComparison, DiffPage, DiffRegion, DiffViewMode, SourceSide } from "./types.js";
import { pageStatus, sourceForSide, statusLabel, statusSymbol, viewModes, zoomLevels } from "./viewer-utils.js";

const MAX_VISIBLE_TEXT_CHANGES = 6;

function ThumbPlaceholder() {
  return <div {...styleProps(styles.thumbPlaceholder)} aria-hidden="true"><span {...styleProps(styles.thumbLine)} /><span {...styleProps(styles.thumbLine, styles.thumbLineShort)} /><span {...styleProps(styles.thumbDiagram)} /><span {...styleProps(styles.thumbLine, styles.thumbLineShort)} /></div>;
}

export function WorkspaceHeader({ comparison, onNewComparison, onHelp }: { comparison: DiffComparison; onNewComparison?: () => void; onHelp: () => void }) {
  return (
    <header {...styleProps(styles.workspaceBar)}>
      <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
      <div {...styleProps(styles.documentPair)} aria-label="Compared documents"><div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>A</span><span {...styleProps(styles.documentChipName)} title={comparison.earlierName}>{comparison.earlierName}</span></div><span {...styleProps(styles.pairArrow)} aria-hidden="true">↔</span><div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>B</span><span {...styleProps(styles.documentChipName)} title={comparison.newerName}>{comparison.newerName}</span></div></div>
      <div {...styleProps(styles.workspaceActions)}><button {...styleProps(styles.helpButton)} type="button" aria-haspopup="dialog" onClick={onHelp}><span {...styleProps(styles.helpButtonMark)} aria-hidden="true">?</span><span {...styleProps(styles.desktopOnly)}>Help</span></button>{onNewComparison ? <button {...styleProps(styles.quietButton)} type="button" onClick={onNewComparison}>New comparison</button> : null}</div>
    </header>
  );
}

export function SourcePageNavigation({ side, page, pageIndex, pageCount, onPageChange, onOpenSource, compact = false }: { side: SourceSide; page: DiffPage | null; pageIndex: number; pageCount: number; onPageChange: (side: SourceSide, index: number) => void; onOpenSource?: (side: SourceSide) => void; compact?: boolean }) {
  const label = side === "earlier" ? "Earlier" : "Newer";
  const shortLabel = side === "earlier" ? "A" : "B";
  return <div {...styleProps(styles.sourcePageGroup, compact && styles.sourcePageGroupCompact)} role="group" aria-label={`${label} PDF page navigation`}><span {...styleProps(styles.sourcePageLabel, compact && styles.sourcePageLabelCompact)}>{compact ? shortLabel : <><span {...styleProps(styles.desktopOnly)}>{label}</span><span {...styleProps(styles.mobileOnly)}>{shortLabel}</span></>}</span><button {...styleProps(styles.sourcePageButton, compact && styles.sourcePageButtonCompact)} type="button" aria-label={`Previous ${label} PDF page`} disabled={pageIndex === 0} onClick={() => onPageChange(side, pageIndex - 1)}>←</button><span {...styleProps(styles.sourcePagePosition, compact && styles.sourcePagePositionCompact)} aria-live="polite">{pageCount ? `${pageIndex + 1} / ${pageCount}` : "—"}</span><button {...styleProps(styles.sourcePageButton, compact && styles.sourcePageButtonCompact)} type="button" aria-label={`Next ${label} PDF page`} disabled={pageIndex >= pageCount - 1} onClick={() => onPageChange(side, pageIndex + 1)}>→</button>{onOpenSource ? <button {...styleProps(styles.sourceButton, compact && styles.sourceButtonCompact)} type="button" aria-label={`Open ${label.toLowerCase()} version of page ${pageIndex + 1} full screen`} title={`View ${label.toLowerCase()} page full screen`} disabled={!sourceForSide(page, side)} onClick={() => onOpenSource(side)}><span aria-hidden="true">↗</span>{compact ? null : <span {...styleProps(styles.desktopOnly)}>View</span>}</button> : null}</div>;
}

export function PageRail({ pages, pageIndex, onSelectPage, earlierPage, newerPage, earlierPageIndex, newerPageIndex, earlierPageCount, newerPageCount, onSourcePageChange, onOpenSource }: { pages: ReadonlyArray<DiffPage>; pageIndex: number; onSelectPage: (index: number) => void; earlierPage: DiffPage | null; newerPage: DiffPage | null; earlierPageIndex: number; newerPageIndex: number; earlierPageCount: number; newerPageCount: number; onSourcePageChange: (side: SourceSide, index: number) => void; onOpenSource: (side: SourceSide) => void }) {
  return (
    <aside {...styleProps(styles.pageRail)} aria-label="Pages">
      <div {...styleProps(styles.railHeader)}><h2 {...styleProps(styles.railHeading)}>Pages <span aria-hidden="true">·</span> {pages.length}</h2><div {...styleProps(styles.railPager)} role="group" aria-label="Comparison page navigation"><button {...styleProps(styles.railPageButton)} type="button" aria-label="Previous comparison page" disabled={pageIndex === 0} onClick={() => onSelectPage(pageIndex - 1)}>←</button><span {...styleProps(styles.railPagePosition)} aria-live="polite">{pageIndex + 1} / {pages.length}</span><button {...styleProps(styles.railPageButton)} type="button" aria-label="Next comparison page" disabled={pageIndex >= pages.length - 1} onClick={() => onSelectPage(pageIndex + 1)}>→</button></div><div {...styleProps(styles.sourceRail)} aria-label="Independent source page navigation"><span {...styleProps(styles.sourceRailHeading)}>Source pages</span><SourcePageNavigation side="earlier" page={earlierPage} pageIndex={earlierPageIndex} pageCount={earlierPageCount} onPageChange={onSourcePageChange} onOpenSource={onOpenSource} compact /><SourcePageNavigation side="newer" page={newerPage} pageIndex={newerPageIndex} pageCount={newerPageCount} onPageChange={onSourcePageChange} onOpenSource={onOpenSource} compact /></div></div>
      {pages.map((page, index) => {
        const state = pageStatus(page);
        return <button key={page.index} {...styleProps(styles.pageButton, index === pageIndex && styles.pageButtonCurrent)} type="button" aria-label={`Page ${index + 1}, ${statusLabel(state)}`} aria-current={index === pageIndex ? "page" : undefined} onClick={() => onSelectPage(index)}><div {...styleProps(styles.pageThumbPair)}><div {...styleProps(styles.pageThumbPane)}>{page.beforeSrc ? <img {...styleProps(styles.pageThumbImage)} src={page.beforeSrc} alt="Earlier page preview" draggable={false} /> : <ThumbPlaceholder />}<span {...styleProps(styles.pageThumbSideLabel)}>A</span></div><div {...styleProps(styles.pageThumbPane)}>{page.afterSrc ? <img {...styleProps(styles.pageThumbImage)} src={page.afterSrc} alt="Newer page preview" draggable={false} /> : <ThumbPlaceholder />}<span {...styleProps(styles.pageThumbSideLabel)}>B</span></div></div><div {...styleProps(styles.pageNumber)}><span>{index + 1}</span><span {...styleProps(styles.pageStatus, state === "changed" && styles.pageStatusChanged, state === "added" && styles.pageStatusAdded, state === "removed" && styles.pageStatusRemoved)}>{statusSymbol(state)}</span></div></button>;
      })}
    </aside>
  );
}

export function ViewerToolbar({ mode, onModeChange, zoom, onZoomChange }: {
  mode: DiffViewMode;
  onModeChange: (mode: DiffViewMode) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  const zoomIndex = zoomLevels.indexOf(zoom as (typeof zoomLevels)[number]);
  return (
    <div {...styleProps(styles.toolbar)}>
      <div {...styleProps(styles.modeGroup)} role="toolbar" aria-label="View mode">{viewModes.map((item) => <button key={item.id} {...styleProps(styles.modeButton, mode === item.id && styles.modeButtonCurrent)} type="button" aria-pressed={mode === item.id} aria-keyshortcuts={item.shortcut} title={`${item.label} (${item.shortcut})`} onClick={() => onModeChange(item.id)}><span {...styleProps(styles.desktopOnly)}>{item.label}</span><span {...styleProps(styles.mobileOnly)}>{item.shortcut}</span></button>)}</div>
      <div {...styleProps(styles.toolbarGroup)}><button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom out" disabled={zoomIndex <= 0} onClick={() => onZoomChange(zoomLevels[Math.max(0, zoomIndex - 1)] ?? zoomLevels[0])}>−</button><span {...styleProps(styles.zoomLabel)}>{zoom}%</span><button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom in" disabled={zoomIndex >= zoomLevels.length - 1} onClick={() => onZoomChange(zoomLevels[Math.min(zoomLevels.length - 1, zoomIndex + 1)] ?? zoomLevels.at(-1)!)}>+</button></div>
    </div>
  );
}

export function StatusFooter({ earlierPageIndex, earlierPageCount, newerPageIndex, newerPageCount, status }: { earlierPageIndex: number; earlierPageCount: number; newerPageIndex: number; newerPageCount: number; status: NonNullable<DiffPage["status"]> }) {
  return <div {...styleProps(styles.statusFooter)}><span {...styleProps(styles.statusAccent)}>{status === "same" ? "No visual changes" : statusLabel(status)}</span><span>A page {earlierPageIndex + 1}/{earlierPageCount} · B page {newerPageIndex + 1}/{newerPageCount}</span><span {...styleProps(styles.shortcutHint)} title="Keyboard shortcuts">← → pages · Shift + ← → A · Ctrl/Cmd + ← → B · 1–7 modes</span></div>;
}

export function ChangeInspector({ currentPage, status, changedPageCount, selectedRegion, showBoundingBoxes, onShowBoundingBoxesChange, onSelectRegion, onNextChange, showSettings, onToggleSettings, sensitivity, alignment, onSensitivityChange, onAlignmentChange, mode, swipe, onSwipeChange, showSemanticHighlights, onShowSemanticHighlightsChange }: {
  currentPage: DiffPage;
  status: NonNullable<DiffPage["status"]>;
  changedPageCount: number;
  selectedRegion: string | null;
  showBoundingBoxes: boolean;
  onShowBoundingBoxesChange: (value: boolean) => void;
  onSelectRegion: (id: string) => void;
  onNextChange: () => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  sensitivity: number;
  alignment: "none" | "translation";
  onSensitivityChange: (value: number) => void;
  onAlignmentChange: (value: "none" | "translation") => void;
  mode: DiffViewMode;
  swipe: number;
  onSwipeChange: (value: number) => void;
  showSemanticHighlights: boolean;
  onShowSemanticHighlightsChange: (value: boolean) => void;
}) {
  const regions = currentPage.regions ?? [];
  const textChanges = currentPage.textChanges ?? [];
  return (
    <aside {...styleProps(styles.inspector)} aria-label="Change inspector">
      <h2 {...styleProps(styles.inspectorHeading)}>Change inspector</h2><p {...styleProps(styles.inspectorSubheading)}>Select a change to locate it on the page.</p>
      <div {...styleProps(styles.changeSummary)}><div {...styleProps(styles.statCard)}><span {...styleProps(styles.statLabel)}>Changed pages</span><strong {...styleProps(styles.statValue, changedPageCount > 0 && styles.statValueWarm)}>{changedPageCount}</strong></div><div {...styleProps(styles.statCard)}><span {...styleProps(styles.statLabel)}>Changed area</span><strong {...styleProps(styles.statValue, (currentPage.changedPercent ?? 0) > 0 && styles.statValueWarm)}>{currentPage.changedPercent ? `${currentPage.changedPercent.toFixed(2)}%` : "—"}</strong></div></div>
      <button {...styleProps(styles.actionButton)} type="button" onClick={onNextChange}>Next changed page <span aria-hidden="true">→</span></button>
      <div {...styleProps(styles.inspectorSection)}><div {...styleProps(styles.sectionLabel)}><span>Regions</span><span>{regions.length}</span></div><Toggle label="Show bounding boxes" checked={showBoundingBoxes} onChange={onShowBoundingBoxesChange} />{regions.length ? <div {...styleProps(styles.changeList)}>{regions.map((region, index) => <ChangeButton key={region.id} id={region.id} label={region.label ?? `${region.kind ?? "Changed"} region ${index + 1}`} count={`#${index + 1}`} kind={region.kind} selected={selectedRegion === region.id} onClick={onSelectRegion} />)}</div> : <div {...styleProps(styles.emptyChanges)}>{status === "same" ? "No regions on this page." : "No regions to inspect."}</div>}</div>
      {textChanges.length ? <div {...styleProps(styles.inspectorSection)}><div {...styleProps(styles.sectionLabel)}><span>Text changes</span><span>{currentPage.textChangeCount && currentPage.textChangeCount > MAX_VISIBLE_TEXT_CHANGES ? `${Math.min(MAX_VISIBLE_TEXT_CHANGES, textChanges.length)}/${currentPage.textChangeCount}` : textChanges.length}</span></div><div {...styleProps(styles.changeList)}>{textChanges.slice(0, MAX_VISIBLE_TEXT_CHANGES).map((change) => <ChangeButton key={change.id} id={change.id} label={change.text} kind={change.kind} selected={selectedRegion === change.id} onClick={onSelectRegion} />)}</div></div> : null}
      <div {...styleProps(styles.inspectorSection)}><button {...styleProps(styles.quietButton)} type="button" aria-expanded={showSettings} onClick={onToggleSettings}>{showSettings ? "Hide comparison settings" : "Comparison settings"}</button>{showSettings ? <div {...styleProps(styles.inspectorSection)}><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="sensitivity">Sensitivity</label><span {...styleProps(styles.controlValue)}>{sensitivity}</span></div><input id="sensitivity" {...styleProps(styles.range)} type="range" min="0" max="100" value={sensitivity} onChange={(event) => onSensitivityChange(Number(event.target.value))} /><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="alignment">Alignment</label><select id="alignment" {...styleProps(styles.select)} value={alignment} onChange={(event) => onAlignmentChange(event.target.value as "none" | "translation")}><option value="none">None</option><option value="translation">Translation only</option></select></div>{mode === "swipe" ? <><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="swipe">Swipe position</label><span {...styleProps(styles.controlValue)}>{swipe}%</span></div><input id="swipe" {...styleProps(styles.range)} type="range" min="0" max="100" value={swipe} onChange={(event) => onSwipeChange(Number(event.target.value))} /></> : null}</div> : null}</div>
      <Toggle label="Semantic highlights" checked={showSemanticHighlights} onChange={onShowSemanticHighlightsChange} />
    </aside>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label {...styleProps(styles.switchRow)}><span {...styleProps(styles.switchLabel)}>{label}</span><span {...styleProps(styles.switch, checked && styles.switchOn)}><input type="checkbox" role="switch" aria-checked={checked} checked={checked} onChange={(event) => onChange(event.target.checked)} {...styleProps(styles.switchInput)} /><span {...styleProps(styles.switchThumb, checked && styles.switchThumbOn)} aria-hidden="true" /></span></label>;
}

function ChangeButton({ id, label, count, kind, selected, onClick }: { id: string; label: string; count?: string; kind?: DiffRegion["kind"]; selected: boolean; onClick: (id: string) => void }) {
  return <button {...styleProps(styles.changeButton, selected && styles.changeButtonCurrent)} type="button" onClick={() => onClick(id)}><span {...styleProps(styles.changeDot, kind === "added" && styles.changeDotAdded, kind === "removed" && styles.changeDotRemoved)} aria-hidden="true" /><span {...styleProps(styles.changeText)}>{label}</span>{count ? <span {...styleProps(styles.changeCount)}>{count}</span> : null}</button>;
}
