import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Keyboard,
  Maximize2,
  Minimize2,
  RotateCcw,
  Settings,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { styles, cx, ui } from "./styles.js";
import type { CSSProperties } from "react";
import type { DiffComparison, DiffPage, DiffViewMode, OverlayStyle, ViewerSettings } from "./types.js";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  changedPageCount,
  collapsedRailSummary,
  pagePairDescription,
  pagePairLabel,
  pageStatus,
  statusText,
  nextTextFilter,
  textChangeFilters,
  viewModes,
  visiblePageIndexes,
  ZOOM_STEP,
  type TextChangeFilter,
} from "./viewer-utils.js";
import type { ReportTotals } from "@pdfdiff/core";
import { comparisonProgress, headerTextWarning, workspaceHeadline } from "./summary.js";
import type { ExportChoice } from "./export.js";

function ThumbPlaceholder() {
  return (
    <div className={styles.thumbPlaceholder} aria-hidden="true">
      <span className={styles.thumbLine} />
      <span className={cx(styles.thumbLine, styles.thumbLineShort)} />
      <span className={styles.thumbDiagram} />
      <span className={cx(styles.thumbLine, styles.thumbLineShort)} />
    </div>
  );
}

/** The document-level answer belongs beside the document names, not in a bar of its own. */
export function WorkspaceHeader({
  comparison,
  summary,
  processingProgress,
  onNewComparison,
  headerActions,
}: {
  comparison: DiffComparison;
  summary: ReportTotals;
  processingProgress?: { completed: number; total: number };
  onNewComparison?: () => void;
  headerActions?: ReactNode;
}) {
  const progress = comparisonProgress(comparison.pages, processingProgress);
  const headline = workspaceHeadline(summary, progress);
  const textWarning = progress ? null : headerTextWarning(summary);
  return (
    <header className={styles.workspaceBar}>
      <div className={styles.logo}>
        <span className={styles.logoMark} aria-hidden="true">
          ◐
        </span>
        <span className={styles.logoWord}>pdfdiff</span>
      </div>
      <div className={styles.documentPair} aria-label="Compared documents">
        <div className={styles.documentChip}>
          <span className={styles.documentChipLabel}>A</span>
          <span className={styles.documentChipName} title={comparison.earlierName}>
            {comparison.earlierName}
          </span>
        </div>
        <span className={styles.pairArrow} aria-hidden="true">
          ↔
        </span>
        <div className={styles.documentChip}>
          <span className={styles.documentChipLabel}>B</span>
          <span className={styles.documentChipName} title={comparison.newerName}>
            {comparison.newerName}
          </span>
        </div>
      </div>
      <div className={styles.headerSummary} aria-label="Comparison summary">
        <strong className={styles.headerHeadline}>{headline}</strong>
        {textWarning ? (
          <span className={styles.headerWarning} title={textWarning.title}>
            {textWarning.message}
          </span>
        ) : null}
      </div>
      <div className={styles.workspaceActions}>
        {headerActions}
        {onNewComparison ? (
          <button className={styles.quietButton} type="button" onClick={onNewComparison}>
            New comparison
          </button>
        ) : null}
      </div>
    </header>
  );
}

function Menu({
  label,
  icon,
  items,
}: {
  label: string;
  icon: ReactNode;
  items: ReadonlyArray<{ readonly label: string; readonly onSelect: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.type === "pointerdown" && wrap.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);
  return (
    <div ref={wrap} className={styles.menuWrap}>
      <button
        className={cx(styles.quietButton, open && styles.modeButtonCurrent)}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        {label}
      </button>
      {open ? (
        <div className={styles.menuPanel} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              className={styles.menuItem}
              type="button"
              role="menuitem"
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const exportOptions: ReadonlyArray<readonly [ExportChoice, string]> = [
  ["page-image", "This page's diff image (.png)"],
  ["text", "Change summary (.txt)"],
  ["csv", "Change list (.csv)"],
  ["json", "Full report (.json)"],
];

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  active,
  expanded,
  desktopOnly,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  expanded?: boolean;
  desktopOnly?: boolean;
}) {
  return (
    <button
      className={cx(styles.iconButton, active && styles.modeButtonCurrent, desktopOnly && styles.toolbarDesktopOnly)}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function pageThumbnail(page: DiffPage): string | undefined {
  return page.diffSrc ?? page.afterSrc ?? page.beforeSrc;
}

function pageStatusStyle(status: NonNullable<DiffPage["status"]>, provisional?: boolean) {
  if (provisional) return undefined;
  if (status === "same") return styles.pageStatusSame;
  if (status === "changed") return styles.pageStatusChanged;
  if (status === "added") return styles.pageStatusAdded;
  return status === "removed" ? styles.pageStatusRemoved : undefined;
}

function PageRailItem({
  page,
  index,
  mode,
  textFilter,
  selected,
  provisional,
  onSelect,
}: {
  page: DiffPage;
  index: number;
  mode: DiffViewMode;
  textFilter: TextChangeFilter;
  selected: boolean;
  provisional?: boolean;
  onSelect: (index: number) => void;
}) {
  const state = pageStatus(page);
  const thumbnail = pageThumbnail(page);
  const status = statusText(page, state, mode, textFilter);
  return (
    <button
      className={cx(styles.pageButton, selected && styles.pageButtonCurrent)}
      type="button"
      aria-label={pagePairDescription(page, index, state)}
      aria-current={selected ? "page" : undefined}
      onClick={() => onSelect(index)}
    >
      <div className={styles.pageThumb}>
        {thumbnail ? (
          <img
            className={styles.pageThumbImage}
            src={thumbnail}
            alt="Comparison overlay preview"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : (
          <ThumbPlaceholder />
        )}
        {page.alignment === "moved" ? <span className={styles.pageBadge}>moved</span> : null}
      </div>
      <div className={styles.pageNumber}>
        <span>{pagePairLabel(page, index)}</span>
        <span className={cx(styles.pageStatus, pageStatusStyle(state, provisional))}>{status}</span>
      </div>
    </button>
  );
}

export function PageRail({
  pages,
  pageIndex,
  mode,
  textFilter = "all",
  onSelectPage,
  onlyChanged,
  onOnlyChanged,
  collapsed,
  onCollapsedChange,
}: {
  pages: ReadonlyArray<DiffPage>;
  onlyChanged: boolean;
  pageIndex: number;
  mode: DiffViewMode;
  textFilter?: TextChangeFilter;
  onSelectPage: (index: number) => void;
  onOnlyChanged: (value: boolean) => void;
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
}) {
  const visible = visiblePageIndexes(pages, onlyChanged, pageIndex);
  const provisional = pages.some((page) => pageStatus(page) === "processing");
  if (pages.length <= 1) return null;
  const changed = changedPageCount(pages);
  const location = collapsedRailSummary(pageIndex, pages.length, changed);
  const current = pages[pageIndex];
  return (
    <aside className={cx(styles.pageRail, collapsed && styles.pageRailCollapsed)} aria-label="Pages">
      <div className={cx(styles.railHeader, collapsed && styles.railHeaderCollapsed)}>
        <div className={styles.railHeaderTop}>
          {collapsed ? null : <h2 className={styles.railHeading}>Pages</h2>}
          <button
            className={styles.railToggle}
            type="button"
            aria-label={collapsed ? `Show page list, ${location}` : "Hide page list"}
            title={collapsed ? `Show page list, ${location}` : "Hide page list"}
            aria-expanded={!collapsed}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
        {collapsed ? (
          <p
            className={styles.railCollapsedSummary}
            role="status"
            title={current ? `${pagePairLabel(current, pageIndex)} · ${location}` : location}
          >
            <span className={styles.railCollapsedPage}>
              {pageIndex + 1}/{pages.length}
            </span>
            {changed > 0 ? <span className={styles.railCollapsedChanged}>{changed} changed</span> : null}
          </p>
        ) : (
          <label className="flex items-center gap-2 text-2xs text-muted-foreground">
            <input
              className={`${ui.focus} pdfdiff-switch`}
              type="checkbox"
              checked={onlyChanged}
              onChange={(event) => onOnlyChanged(event.target.checked)}
            />
            Only changed
          </label>
        )}
      </div>
      {collapsed
        ? null
        : visible.map((index) => (
            <PageRailItem
              key={pages[index]!.index}
              page={pages[index]!}
              index={index}
              mode={mode}
              textFilter={textFilter}
              selected={index === pageIndex}
              provisional={provisional}
              onSelect={onSelectPage}
            />
          ))}
    </aside>
  );
}

export function PairingControls({
  page,
  pageIndex,
  manual,
  cue,
  canChangePair,
  onChangePair,
  onReturnToDocument,
}: {
  page: DiffPage;
  pageIndex: number;
  manual: boolean;
  cue: string | null;
  canChangePair: boolean;
  onChangePair: () => void;
  onReturnToDocument: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
      {canChangePair ? (
        // The pair label is the only thing worth clicking here, so it is the button.
        <button className={styles.quietButton} title="Change pairing" onClick={onChangePair}>
          {manual ? "Temporary · " : ""}
          {pagePairLabel(page, pageIndex)}
        </button>
      ) : (
        <span className="text-center text-xs text-foreground">{pagePairLabel(page, pageIndex)}</span>
      )}
      {manual ? (
        <button className={styles.quietButton} onClick={onReturnToDocument}>
          Return to document
        </button>
      ) : null}
      {cue ? (
        <span className={styles.pairingCue} role="status">
          {cue}
        </span>
      ) : null}
    </div>
  );
}

export function PairingDialog({
  earlier,
  newer,
  earlierCount,
  newerCount,
  onApply,
  onClose,
}: {
  earlier?: number;
  newer?: number;
  earlierCount: number;
  newerCount: number;
  onApply: (earlier: number, newer: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`${ui.dialog} m-auto w-80 p-5 text-foreground backdrop:bg-foreground/50`}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="pairing-title"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const a = Number(data.get("earlier")),
            b = Number(data.get("newer"));
          if (!Number.isInteger(a) || a < 1 || a > earlierCount || !Number.isInteger(b) || b < 1 || b > newerCount)
            return;
          onApply(a, b);
          onClose();
        }}
      >
        <h2 id="pairing-title" className="text-lg font-semibold tracking-tight">
          Change pairing
        </h2>
        <p className="text-xs text-muted-foreground">
          Compare these pages temporarily. Select a page in the sidebar to return to the document comparison.
        </p>
        {(
          [
            ["earlier", earlier, earlierCount],
            ["newer", newer, newerCount],
          ] as const
        ).map(([side, value, count]) => (
          <label key={side} className="flex items-center justify-between gap-3 text-sm">
            {side === "earlier" ? "Earlier page" : "Newer page"}
            <input
              className={`${ui.focus} w-20 rounded-lg border border-border bg-card p-2 text-foreground`}
              type="number"
              name={side}
              required
              min={1}
              max={count}
              defaultValue={value ?? 1}
            />
          </label>
        ))}
        <div className="flex justify-end gap-2">
          <button className={styles.quietButton} type="button" onClick={onClose}>
            Cancel
          </button>
          <button className={styles.quietButton} type="submit">
            Compare these pages
          </button>
        </div>
      </form>
    </dialog>
  );
}

function textFilterKeyDirection(key: string): 1 | -1 | null {
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  return null;
}

function TextFilterGroup({
  textFilter,
  onTextFilterChange,
}: {
  textFilter: TextChangeFilter;
  onTextFilterChange: (filter: TextChangeFilter) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = textFilterKeyDirection(event.key);
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation(); // Window-level arrows walk pages.
    const next = nextTextFilter(textFilter, direction);
    onTextFilterChange(next);
    const root = groupRef.current;
    requestAnimationFrame(() => {
      root?.querySelector<HTMLElement>(`[data-text-filter="${next}"]`)?.focus();
    });
  };
  return (
    <div ref={groupRef} className={styles.toolbarGroup} role="radiogroup" aria-label="Text change filter">
      {textChangeFilters.map((item) => (
        <button
          key={item.id}
          data-text-filter={item.id}
          className={cx(styles.filterChip, textFilter === item.id && styles.filterChipOn)}
          type="button"
          role="radio"
          aria-checked={textFilter === item.id}
          tabIndex={textFilter === item.id ? 0 : -1}
          onClick={() => onTextFilterChange(item.id)}
          onKeyDown={onKeyDown}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function ViewerToolbar({
  mode,
  onModeChange,
  textFilter = "all",
  onTextFilterChange,
  zoom,
  onZoomChange,
  textUnavailable,
  isFullscreen,
  onToggleFullscreen,
  onSettings,
  onHelp,
  onExport,
  canExportImage,
  navigation,
}: {
  mode: DiffViewMode;
  onModeChange: (mode: DiffViewMode) => void;
  textFilter?: TextChangeFilter;
  onTextFilterChange?: (filter: TextChangeFilter) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  textUnavailable?: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onExport?: (choice: ExportChoice) => void;
  canExportImage: boolean;
  navigation?: ReactNode;
}) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.modeGroup} role="toolbar" aria-label="View mode">
        {viewModes.map((item) => {
          const disabled = item.id === "semantic-text" && textUnavailable;
          return (
            <button
              key={item.id}
              className={cx(styles.modeButton, mode === item.id && styles.modeButtonCurrent)}
              type="button"
              disabled={disabled}
              aria-pressed={mode === item.id}
              aria-keyshortcuts={item.shortcut}
              title={
                disabled
                  ? "Text comparison unavailable: this PDF has no Unicode mapping. Overlay, Split, and Swipe still apply."
                  : `${item.label} (${item.shortcut})`
              }
              onClick={() => onModeChange(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {mode === "semantic-text" && onTextFilterChange ? (
        <TextFilterGroup textFilter={textFilter} onTextFilterChange={onTextFilterChange} />
      ) : null}
      {navigation}
      <div className={styles.toolbarGroup}>
        <IconButton
          label="Zoom out"
          icon={<ZoomOut size={16} />}
          disabled={zoom <= MIN_ZOOM}
          onClick={() => onZoomChange(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}
        />
        <span className={styles.zoomLabel}>{zoom}%</span>
        <IconButton
          label="Zoom in"
          icon={<ZoomIn size={16} />}
          disabled={zoom >= MAX_ZOOM}
          onClick={() => onZoomChange(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}
        />
        <IconButton
          desktopOnly
          label="Reset zoom"
          icon={<RotateCcw size={16} />}
          disabled={zoom === 100}
          onClick={() => onZoomChange(100)}
        />
        <IconButton
          desktopOnly
          label="Fullscreen"
          icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          onClick={onToggleFullscreen}
        />
        <IconButton label="Settings" icon={<Settings size={16} />} onClick={onSettings} />
        <IconButton desktopOnly label="Keyboard shortcuts" icon={<Keyboard size={16} />} onClick={onHelp} />
        {onExport ? (
          <Menu
            label="Export"
            icon={<Download size={16} />}
            items={(canExportImage ? exportOptions : exportOptions.filter(([choice]) => choice !== "page-image")).map(
              ([choice, label]) => ({ label, onSelect: () => onExport(choice) }),
            )}
          />
        ) : null}
      </div>
    </div>
  );
}

export function StatusFooter({ processingProgress }: { processingProgress?: { completed: number; total: number } }) {
  if (!processingProgress) return null;
  const percent = processingProgress.total
    ? Math.round((processingProgress.completed / processingProgress.total) * 100)
    : 0;
  return (
    <div className={styles.statusFooter} aria-live="polite">
      <div
        className={styles.statusProgress}
        role="progressbar"
        aria-label="Comparison progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={styles.statusProgressFill} style={{ width: `${percent}%` }} />
      </div>
      <span className={styles.statusAccent}>
        Comparing page {Math.min(processingProgress.completed + 1, processingProgress.total)} of{" "}
        {processingProgress.total}
      </span>
      <span>{percent}%</span>
    </div>
  );
}

function SettingsCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={styles.settingsRow}>
      {label}
      <input
        className={styles.settingsCheckbox}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

/** Appearance and filters, plus the one control that does re-run the comparison. */
export function SettingsDialog({
  overlay,
  onOverlayChange,
  settings,
  onSettingsChange,
  matchPages,
  onMatchPagesChange,
  onClose,
}: {
  overlay: OverlayStyle;
  onOverlayChange: (overlay: OverlayStyle) => void;
  settings: ViewerSettings;
  onSettingsChange: (settings: ViewerSettings) => void;
  matchPages?: boolean;
  onMatchPagesChange?: (matchPages: boolean) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const update = <Key extends keyof ViewerSettings>(key: Key, value: ViewerSettings[Key]) =>
    onSettingsChange({ ...settings, [key]: value });
  useEffect(() => closeButtonRef.current?.focus(), []);
  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);
  return (
    <div
      className={styles.dialogBackdrop}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.settingsDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="viewer-settings-title"
      >
        <header className={styles.helpHeader}>
          <h2 id="viewer-settings-title" className={styles.helpTitle}>
            Settings
          </h2>
          <button
            ref={closeButtonRef}
            className={styles.iconButton}
            type="button"
            aria-label="Close settings"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className={styles.settingsBody}>
          <section className={styles.settingsGroup}>
            <h3 className={styles.settingsGroupTitle}>Overlay colours</h3>
            <label className={styles.settingsRow}>
              Newer content
              <input
                className={styles.overlaySwatch}
                type="color"
                value={overlay.addedColor}
                aria-label="Colour for newer content"
                onChange={(event) => onOverlayChange({ ...overlay, addedColor: event.target.value })}
              />
            </label>
            <label className={styles.settingsRow}>
              Earlier content
              <input
                className={styles.overlaySwatch}
                type="color"
                value={overlay.removedColor}
                aria-label="Colour for earlier content"
                onChange={(event) => onOverlayChange({ ...overlay, removedColor: event.target.value })}
              />
            </label>
            <label className={styles.settingsRow}>
              Modified content
              <input
                className={styles.overlaySwatch}
                type="color"
                value={overlay.modifiedColor}
                aria-label="Colour for modified content"
                onChange={(event) => onOverlayChange({ ...overlay, modifiedColor: event.target.value })}
              />
            </label>
            <label className={styles.settingsRow}>
              Unchanged {Math.round(overlay.unchangedOpacity * 100)}%
              <input
                className={styles.overlayRange}
                style={{ "--range-fill": `${Math.round(overlay.unchangedOpacity * 100)}%` } as CSSProperties}
                type="range"
                min={0}
                max={100}
                value={Math.round(overlay.unchangedOpacity * 100)}
                aria-label="How strongly unchanged content shows through"
                onChange={(event) =>
                  onOverlayChange({ ...overlay, unchangedOpacity: Number(event.target.value) / 100 })
                }
              />
            </label>
          </section>
          <section className={styles.settingsGroup}>
            <h3 className={styles.settingsGroupTitle}>View</h3>
            <SettingsCheckbox
              label="Outline changed regions"
              checked={settings.showBoundingBoxes}
              onChange={(value) => update("showBoundingBoxes", value)}
            />
          </section>
          {onMatchPagesChange ? (
            <section className={styles.settingsGroup}>
              <h3 className={styles.settingsGroupTitle}>Comparison</h3>
              <SettingsCheckbox
                label="Match pages automatically"
                checked={matchPages !== false}
                onChange={onMatchPagesChange}
              />
              <p className={styles.settingsNote}>
                Pairs pages by content so inserted or removed pages stay aligned. Off compares page 1 with page 1.
                Changing this compares the PDFs again.
              </p>
            </section>
          ) : null}
        </div>
        <footer className={styles.helpFooter}>
          <button className={styles.quietButton} type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
