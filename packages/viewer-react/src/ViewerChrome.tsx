/* The reusable package cannot depend on Next.js's Image component. */
/* eslint-disable @next/next/no-img-element */
import { type ReactNode, useState } from "react";
import { styles, styleProps } from "./styles.js";
import type { DiffComparison, DiffPage, DiffRegion, DiffViewMode, SourceSide } from "./types.js";
import { pageStatus, sourceForSide, statusLabel, statusSymbol, viewModes, zoomLevels } from "./viewer-utils.js";

const MAX_VISIBLE_CHANGES = 6;

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

function UnifiedPageNavigation({ earlierPageIndex, newerPageIndex, earlierPageCount, newerPageCount, onPageChange }: { earlierPageIndex: number; newerPageIndex: number; earlierPageCount: number; newerPageCount: number; onPageChange: (side: SourceSide, index: number) => void }) {
  const pageRow = (side: SourceSide, pageIndex: number, pageCount: number) => {
    const shortLabel = side === "earlier" ? "A" : "B";
    const sourceLabel = side === "earlier" ? "source A" : "source B";
    return <div {...styleProps(styles.unifiedPageRow)}><button {...styleProps(styles.railPageButton)} type="button" aria-label={`Previous ${sourceLabel} page`} disabled={pageIndex === 0} onClick={() => onPageChange(side, pageIndex - 1)}>←</button><span {...styleProps(styles.unifiedPagePosition)} aria-live="polite"><span {...styleProps(styles.unifiedPageLabel)}>{shortLabel}</span><strong>{pageCount ? `${pageIndex + 1} / ${pageCount}` : "—"}</strong></span><button {...styleProps(styles.railPageButton)} type="button" aria-label={`Next ${sourceLabel} page`} disabled={pageIndex >= pageCount - 1} onClick={() => onPageChange(side, pageIndex + 1)}>→</button></div>;
  };
  return <div {...styleProps(styles.unifiedPageNavigation)} role="group" aria-label="Independent PDF page navigation">{pageRow("earlier", earlierPageIndex, earlierPageCount)}{pageRow("newer", newerPageIndex, newerPageCount)}</div>;
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
  return <button {...styleProps(styles.pageButton, selected && styles.pageButtonCurrent)} type="button" aria-label={`Compare A page ${index + 1} with B page ${index + 1}, ${statusLabel(state)}`} aria-current={selected ? "page" : undefined} onClick={() => onSelect(index)}><div {...styleProps(styles.pageThumb)}>{thumbnail ? <img {...styleProps(styles.pageThumbImage)} src={thumbnail} alt="Comparison overlay preview" draggable={false} /> : <ThumbPlaceholder />}</div><div {...styleProps(styles.pageNumber)}><span>A {index + 1} ↔ B {index + 1}</span><span {...styleProps(styles.pageStatus, pageStatusStyle(state))}>{status}</span></div></button>;
}

export function PageRail({ pages, pageIndex, earlierPageIndex, newerPageIndex, earlierPageCount, newerPageCount, onSelectPage, onSourcePageChange }: { pages: ReadonlyArray<DiffPage>; pageIndex: number; earlierPageIndex: number; newerPageIndex: number; earlierPageCount: number; newerPageCount: number; onSelectPage: (index: number) => void; onSourcePageChange: (side: SourceSide, index: number) => void }) {
  const [pageFilter, setPageFilter] = useState<"all" | "changed">("all");
  const changedPageCount = pages.reduce((count, page) => count + (pageStatus(page) === "same" ? 0 : 1), 0);
  const visiblePages = pageFilter === "changed" ? pages.map((page, index) => ({ page, index })).filter(({ page }) => pageStatus(page) !== "same") : pages.map((page, index) => ({ page, index }));
  return (
    <aside {...styleProps(styles.pageRail)} aria-label="Pages">
      <div {...styleProps(styles.railHeader)}>
        <div {...styleProps(styles.railTitleRow)}>
          <h2 {...styleProps(styles.railHeading)}>Pages</h2>
          <span {...styleProps(styles.railPagePosition)}>{pages.length}</span>
        </div>
        <UnifiedPageNavigation earlierPageIndex={earlierPageIndex} newerPageIndex={newerPageIndex} earlierPageCount={earlierPageCount} newerPageCount={newerPageCount} onPageChange={onSourcePageChange} />
        <div {...styleProps(styles.railFilterGroup)} role="group" aria-label="Page filter">
          <button {...styleProps(styles.railFilterButton, pageFilter === "all" && styles.modeButtonCurrent)} type="button" aria-pressed={pageFilter === "all"} onClick={() => setPageFilter("all")}>All <span>{pages.length}</span></button>
          <button {...styleProps(styles.railFilterButton, pageFilter === "changed" && styles.modeButtonCurrent)} type="button" aria-pressed={pageFilter === "changed"} onClick={() => setPageFilter("changed")}>Changed <span>{changedPageCount}</span></button>
        </div>
      </div>
      {visiblePages.map(({ page, index }) => <PageRailItem key={page.index} page={page} index={index} selected={index === pageIndex} onSelect={onSelectPage} />)}
    </aside>
  );
}

export function ViewerToolbar({ mode, onModeChange, zoom, onZoomChange, earlierPage, newerPage, earlierPageIndex, newerPageIndex, onOpenSource }: {
  mode: DiffViewMode;
  onModeChange: (mode: DiffViewMode) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  earlierPage: DiffPage | null;
  newerPage: DiffPage | null;
  earlierPageIndex: number;
  newerPageIndex: number;
  onOpenSource: (side: SourceSide) => void;
}) {
  const zoomIndex = zoomLevels.indexOf(zoom as (typeof zoomLevels)[number]);
  return (
    <div {...styleProps(styles.toolbar)}>
      <div {...styleProps(styles.toolbarGroup)}>
        <div {...styleProps(styles.modeGroup)} role="toolbar" aria-label="View mode">{viewModes.map((item) => <button key={item.id} {...styleProps(styles.modeButton, mode === item.id && styles.modeButtonCurrent)} type="button" aria-pressed={mode === item.id} aria-keyshortcuts={item.shortcut} title={`${item.label} (${item.shortcut})`} onClick={() => onModeChange(item.id)}><span {...styleProps(styles.desktopOnly)}>{item.label}</span><span {...styleProps(styles.mobileOnly)}>{item.shortcut}</span></button>)}</div>
        <div {...styleProps(styles.sourceGroup)} role="group" aria-label="Open source page">
          <button {...styleProps(styles.sourceButton)} type="button" aria-label={`Open source A page ${earlierPageIndex + 1}`} title="Open source A" disabled={!sourceForSide(earlierPage, "earlier")} onClick={() => onOpenSource("earlier")}>A <span aria-hidden="true">↗</span></button>
          <button {...styleProps(styles.sourceButton)} type="button" aria-label={`Open source B page ${newerPageIndex + 1}`} title="Open source B" disabled={!sourceForSide(newerPage, "newer")} onClick={() => onOpenSource("newer")}>B <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <div {...styleProps(styles.toolbarGroup)}><button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom out" disabled={zoomIndex <= 0} onClick={() => onZoomChange(zoomLevels[Math.max(0, zoomIndex - 1)] ?? zoomLevels[0])}>−</button><span {...styleProps(styles.zoomLabel)}>{zoom}%</span><button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom in" disabled={zoomIndex >= zoomLevels.length - 1} onClick={() => onZoomChange(zoomLevels[Math.min(zoomLevels.length - 1, zoomIndex + 1)] ?? zoomLevels.at(-1)!)}>+</button></div>
    </div>
  );
}

export function StatusFooter({ earlierPageIndex, earlierPageCount, newerPageIndex, newerPageCount, status }: { earlierPageIndex: number; earlierPageCount: number; newerPageIndex: number; newerPageCount: number; status: NonNullable<DiffPage["status"]> }) {
  return <div {...styleProps(styles.statusFooter)}><span {...styleProps(styles.statusAccent)}>{status === "same" ? "No visual changes" : statusLabel(status)}</span><span>A page {earlierPageIndex + 1}/{earlierPageCount} · B page {newerPageIndex + 1}/{newerPageCount}</span><span {...styleProps(styles.shortcutHint)} title="Keyboard shortcuts">← → pages · Shift + ← → A · Ctrl/Cmd + ← → B · 1–4 modes</span></div>;
}

interface ChangeInspectorProps {
  currentPage: DiffPage;
  earlierPageNumber: number;
  newerPageNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: NonNullable<DiffPage["status"]>;
  selectedRegion: string | null;
  showBoundingBoxes: boolean;
  onShowBoundingBoxesChange: (value: boolean) => void;
  onSelectRegion: (id: string) => void;
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
}

interface ChangeEntry {
  id: string;
  label: string;
  count?: string;
  kind?: DiffRegion["kind"];
}

function ChangeListSection({ title, entries, selectedId, emptyMessage, onSelect, children }: { title: string; entries: readonly ChangeEntry[]; selectedId: string | null; emptyMessage?: string; onSelect: (id: string) => void; children?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const visibleEntries = expanded ? entries : entries.slice(0, MAX_VISIBLE_CHANGES);
  return <div {...styleProps(styles.inspectorSection)}><div {...styleProps(styles.sectionLabel)}><span>{title}</span><span>{entries.length}</span></div>{children}{entries.length ? <div {...styleProps(styles.changeList)}>{visibleEntries.map((entry) => <ChangeButton key={entry.id} {...entry} selected={selectedId === entry.id} onClick={onSelect} />)}{entries.length > MAX_VISIBLE_CHANGES ? <button {...styleProps(styles.quietButton)} type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? `Show fewer ${title.toLowerCase()}` : `Show all ${entries.length} ${title.toLowerCase()}`}</button> : null}</div> : <div {...styleProps(styles.emptyChanges)}>{emptyMessage}</div>}</div>;
}

function ComparisonSettings({ open, onToggle, sensitivity, alignment, onSensitivityChange, onAlignmentChange, mode, swipe, onSwipeChange }: Pick<ChangeInspectorProps, "sensitivity" | "alignment" | "onSensitivityChange" | "onAlignmentChange" | "mode" | "swipe" | "onSwipeChange"> & { open: boolean; onToggle: () => void }) {
  return <div {...styleProps(styles.inspectorSection)}><button {...styleProps(styles.quietButton)} type="button" aria-expanded={open} onClick={onToggle}>{open ? "Hide comparison settings" : "Comparison settings"}</button>{open ? <div {...styleProps(styles.inspectorSection)}><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="sensitivity">Sensitivity</label><span {...styleProps(styles.controlValue)}>{sensitivity}</span></div><input id="sensitivity" {...styleProps(styles.range)} type="range" min="0" max="100" value={sensitivity} onChange={(event) => onSensitivityChange(Number(event.target.value))} /><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="alignment">Alignment</label><select id="alignment" {...styleProps(styles.select)} value={alignment} onChange={(event) => onAlignmentChange(event.target.value as "none" | "translation")}><option value="none">None</option><option value="translation">Translation only</option></select></div>{mode === "swipe" ? <><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="swipe">Swipe position</label><span {...styleProps(styles.controlValue)}>{swipe}%</span></div><input id="swipe" {...styleProps(styles.range)} type="range" min="0" max="100" value={swipe} onChange={(event) => onSwipeChange(Number(event.target.value))} /></> : null}</div> : null}</div>;
}

function TextChangesSection({ mode, entries, selectedId, onSelect }: { mode: DiffViewMode; entries: readonly ChangeEntry[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (mode !== "semantic-text" || entries.length === 0) return null;
  return <ChangeListSection title="Text changes" entries={entries} selectedId={selectedId} onSelect={onSelect} />;
}

function SemanticHighlightsToggle({ mode, checked, onChange }: { mode: DiffViewMode; checked: boolean; onChange: (value: boolean) => void }) {
  if (mode !== "semantic-text") return null;
  return <Toggle label="Semantic highlights" checked={checked} onChange={onChange} />;
}

function ExpandedChangeInspector({ currentPage, earlierPageNumber, newerPageNumber, onOpenChange, status, selectedRegion, showBoundingBoxes, onShowBoundingBoxesChange, onSelectRegion, showSettings, onToggleSettings, sensitivity, alignment, onSensitivityChange, onAlignmentChange, mode, swipe, onSwipeChange, showSemanticHighlights, onShowSemanticHighlightsChange }: ChangeInspectorProps) {
  const regions = currentPage.regions ?? [];
  const textChanges = currentPage.textChanges ?? [];
  const regionEntries = regions.map((region, index) => ({ id: region.id, label: describeRegion(region, index), count: `#${index + 1}`, kind: region.kind }));
  const textEntries = textChanges.map((change, index) => ({ id: change.id, label: describeTextChange(change.text, change.kind, index), kind: change.kind }));
  return <><div {...styleProps(styles.inspectorHeader)}><h2 {...styleProps(styles.inspectorHeading)}>Changes</h2><button {...styleProps(styles.iconButton)} type="button" aria-label="Collapse change inspector" aria-expanded="true" onClick={() => onOpenChange(false)}>→</button></div><p {...styleProps(styles.inspectorSubheading)}>A page {earlierPageNumber} compared with B page {newerPageNumber} · {status === "same" ? "No visual changes" : statusLabel(status)}.</p><ChangeListSection title="Visual regions" entries={regionEntries} selectedId={selectedRegion} emptyMessage={status === "same" ? "No regions on this page." : "No regions to inspect."} onSelect={onSelectRegion}>{mode === "diff" ? <Toggle label="Show bounding boxes" checked={showBoundingBoxes} onChange={onShowBoundingBoxesChange} /> : null}</ChangeListSection><TextChangesSection mode={mode} entries={textEntries} selectedId={selectedRegion} onSelect={onSelectRegion} /><ComparisonSettings open={showSettings} onToggle={onToggleSettings} sensitivity={sensitivity} alignment={alignment} onSensitivityChange={onSensitivityChange} onAlignmentChange={onAlignmentChange} mode={mode} swipe={swipe} onSwipeChange={onSwipeChange} /><SemanticHighlightsToggle mode={mode} checked={showSemanticHighlights} onChange={onShowSemanticHighlightsChange} /></>;
}

export function ChangeInspector(props: ChangeInspectorProps) {
  if (!props.open) return <aside {...styleProps(styles.inspector, styles.inspectorCollapsed)} aria-label="Change inspector"><button {...styleProps(styles.inspectorCollapsedButton)} type="button" aria-label="Open change inspector" aria-expanded="false" onClick={() => props.onOpenChange(true)}>Changes</button></aside>;
  return <aside {...styleProps(styles.inspector, styles.inspectorOpen)} aria-label="Change inspector"><ExpandedChangeInspector {...props} /></aside>;
}

function describeRegion(region: DiffRegion, index: number): string {
  const label = region.label?.trim();
  if (label && !/^change\s+\d+$/i.test(label)) return label;
  const kind = region.kind === "added" ? "Added" : region.kind === "removed" ? "Removed" : "Changed";
  return `${kind} area ${index + 1}`;
}

function describeTextChange(text: string, kind: DiffRegion["kind"], index: number): string {
  const prefix = kind === "added" ? "Added text" : kind === "removed" ? "Removed text" : "Changed text";
  const normalizedText = text.trim();
  return normalizedText ? `${prefix}: ${normalizedText}` : `${prefix} ${index + 1}`;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label {...styleProps(styles.switchRow)}><span {...styleProps(styles.switchLabel)}>{label}</span><span {...styleProps(styles.switch, checked && styles.switchOn)}><input type="checkbox" role="switch" aria-checked={checked} checked={checked} onChange={(event) => onChange(event.target.checked)} {...styleProps(styles.switchInput)} /><span {...styleProps(styles.switchThumb, checked && styles.switchThumbOn)} aria-hidden="true" /></span></label>;
}

function ChangeButton({ id, label, count, kind, selected, onClick }: { id: string; label: string; count?: string; kind?: DiffRegion["kind"]; selected: boolean; onClick: (id: string) => void }) {
  return <button {...styleProps(styles.changeButton, selected && styles.changeButtonCurrent)} type="button" onClick={() => onClick(id)}><span {...styleProps(styles.changeDot, kind === "added" && styles.changeDotAdded, kind === "removed" && styles.changeDotRemoved)} aria-hidden="true" /><span {...styleProps(styles.changeText)}>{label}</span>{count ? <span {...styleProps(styles.changeCount)}>{count}</span> : null}</button>;
}
