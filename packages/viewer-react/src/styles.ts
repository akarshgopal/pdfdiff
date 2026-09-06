import { twMerge } from "tailwind-merge";

export type TailwindClass = string | false | null | undefined;

/**
 * Compose classes; later arguments win. The style tables below are already
 * merged at import, so an element that needs no composition can use one
 * directly as its className.
 */
export const cx = (...values: TailwindClass[]) => twMerge(values.filter(Boolean).join(" "));

/**
 * Design system, such as it is: tokens live in theme.css, these five strings are
 * the shared patterns, and every style below composes them. Nothing else should
 * hand-roll a focus ring, a card border, or an uppercase label.
 */
export const ui = {
  focus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  /** Uppercase section label: eyebrows, group titles, column headers. */
  caps: "text-3xs font-semibold uppercase tracking-caps text-muted-foreground",
  /** Any raised surface on the page background. */
  card: "rounded-xl border border-border bg-card",
  /** Any clickable chrome that is not the primary button. */
  control:
    "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card text-2xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
  /** Modal panel; pair with dialogBackdrop. */
  dialog: "flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg",
} as const;

export const styles = {
  viewerRoot: "flex h-screen min-h-0 flex-none flex-col",
  workspaceBar:
    "flex h-13 min-h-13 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3.5 lg:gap-4 lg:px-5",
  logo: "inline-flex items-center gap-2 whitespace-nowrap text-sm font-semibold tracking-tight",
  logoWord: "sr-only sm:not-sr-only",
  logoMark: "grid size-6 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground",
  documentPair: "hidden min-w-0 items-center gap-2 lg:flex",
  documentChip:
    "flex min-w-0 max-w-[220px] items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium",
  documentChipLabel: cx(ui.caps, "text-accent-foreground"),
  documentChipName: "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
  pairArrow: "text-base font-bold text-primary/80",
  headerSummary: "ml-auto flex min-w-0 items-center gap-2 text-2xs",
  headerHeadline: "truncate text-2xs font-medium text-foreground",
  headerWarning: "hidden shrink-0 rounded-lg bg-primary/10 px-2 py-1 text-2xs font-medium text-primary sm:block",
  workspaceActions: "flex items-center gap-1.5",
  quietButton: `${ui.control} ${ui.focus} min-h-8 px-2.5 hover:bg-secondary`,
  /** The one action the workspace is for: walking the changes. */
  primaryButton: `${ui.control} ${ui.focus} min-h-8 border-primary/60 bg-primary px-2.5 font-semibold text-primary-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground`,
  helpButton: `${ui.control} ${ui.focus} min-h-8 px-2.5 hover:bg-secondary`,
  helpButtonMark:
    "grid size-4 place-items-center rounded-full border border-current text-3xs font-semibold leading-none",
  workspaceMain:
    "grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[124px_minmax(0,1fr)] lg:grid-rows-none xl:grid-cols-[140px_minmax(0,1fr)]",
  workspaceMainSinglePage: "grid-cols-1 lg:grid-cols-1 xl:grid-cols-1",
  workspaceMainRailCollapsed: "lg:grid-cols-[44px_minmax(0,1fr)] xl:grid-cols-[44px_minmax(0,1fr)]",
  pageRail:
    "order-2 flex min-h-0 items-center gap-2 overflow-x-auto overflow-y-hidden border-t border-sidebar-border bg-sidebar px-2 py-2 lg:order-none lg:block lg:overflow-x-hidden lg:overflow-y-auto lg:border-t-0 lg:border-r lg:px-2.5 lg:py-4",
  railHeader: "flex shrink-0 flex-col gap-2 lg:mb-3",
  railHeaderTop: "flex items-center justify-between gap-1",
  railToggle: cx(ui.control, ui.focus, "size-7 shrink-0 border-transparent bg-transparent p-0"),
  railHeading: cx(ui.caps, "m-0 hidden px-0.5 text-sidebar-foreground lg:block"),
  pageButton: `${ui.focus} w-[72px] shrink-0 cursor-pointer rounded-xl border border-transparent bg-transparent p-1.5 text-left text-sidebar-foreground transition-colors hover:bg-card/75 lg:mb-2 lg:w-full`,
  pageButtonCurrent: "border-primary/60 bg-accent",
  menuWrap: "relative",
  menuPanel: cx(ui.card, "absolute top-full right-0 z-20 mt-1 flex w-56 flex-col overflow-hidden bg-popover shadow-lg"),
  menuItem: `${ui.focus} cursor-pointer border-0 bg-transparent px-3 py-2 text-left text-2xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:bg-accent`,
  railNote: "shrink-0 px-1 py-2 text-center text-3xs text-muted-foreground",
  filterChip: cx(ui.control, ui.focus, "min-h-7 bg-background px-2.5 hover:bg-accent"),
  filterChipOn: "border-primary/60 bg-accent text-foreground",
  pageBadge:
    "absolute left-1 top-1 rounded-md bg-foreground/75 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-caps text-background",
  pageThumb: "relative aspect-[0.72] overflow-hidden rounded-lg border border-border bg-background",
  pageThumbImage: "block size-full bg-white object-contain",
  thumbPlaceholder: "flex size-full animate-pulse flex-col gap-1 bg-card p-[7px] motion-reduce:animate-none",
  thumbLine: "h-0.5 rounded bg-muted",
  thumbLineShort: "w-[62%]",
  thumbDiagram: "mt-0.5 flex-1 rounded-lg border border-border bg-muted",
  pageNumber: "mt-1 grid gap-px px-0.5 text-3xs font-medium leading-tight",
  pageStatus: "truncate text-3xs font-semibold text-muted-foreground",
  pageStatusSame: "text-success",
  pageStatusChanged: "text-primary",
  pageStatusAdded: "text-success",
  pageStatusRemoved: "text-destructive",
  canvasColumn: "order-1 flex min-h-0 min-w-0 flex-col bg-stage lg:order-none",
  toolbar:
    "flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-2.5 py-1.5 sm:px-4",
  toolbarGroup: "flex flex-wrap items-center gap-1.5",
  toolbarNavigation:
    "order-3 flex min-w-0 flex-1 basis-full items-center justify-center gap-2 2xl:order-none 2xl:basis-auto",
  modeGroup: "flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted p-0.5",
  modeButton: cx(ui.control, ui.focus, "min-h-8 border-transparent bg-transparent px-2 disabled:opacity-35"),
  modeButtonCurrent: "border-border bg-card text-foreground",
  iconButton: cx(ui.control, ui.focus, "size-8 p-0 text-sm"),
  /** Fullscreen, reset-zoom, and a shortcut list have no job on a touch screen. */
  toolbarDesktopOnly: "hidden sm:inline-flex",
  zoomLabel: "min-w-[45px] text-center text-2xs tabular-nums text-muted-foreground",
  stage:
    "relative min-h-[300px] flex-1 touch-none cursor-grab overflow-hidden bg-stage p-[clamp(12px,2vw,28px)] select-none",
  stagePanning: "cursor-grabbing",
  stageCenter: "flex min-h-full min-w-full items-start justify-center",
  stageContent: "w-full will-change-transform [transform-origin:center_top]",
  /** The base layer is a translucent greyscale render, so the page needs paper under it in both themes. */
  layerStack: "relative block h-auto w-full bg-white",
  layerBase: "block h-auto w-full",
  layerTint: "pointer-events-none absolute inset-0",
  overlaySwatch: "pdfdiff-swatch",
  overlayRange: "pdfdiff-range w-32",
  overlayLabel: "text-2xs font-medium text-muted-foreground",
  paper:
    "relative mx-auto min-h-[min(520px,45vh)] w-[min(820px,100%)] origin-top overflow-hidden rounded-xl border border-border bg-background",
  /** Two-up modes get two page columns, so the paper doubles: a page is the same size at a given zoom in every mode. */
  paperTwoUp: "w-[min(1660px,100%)]",
  pageImage: "block h-auto min-h-[min(520px,45vh)] w-full select-none object-contain",
  diffImage: "block h-auto min-h-[min(520px,45vh)] w-full select-none object-contain",
  sideBySide: "grid min-h-[min(520px,45vh)] grid-cols-2 gap-px bg-stage",
  sidePanel: "min-w-0 overflow-hidden bg-background",
  /** Page-shaped (US Letter) so the placeholder occupies the space the rendered page will. */
  paperEmpty:
    "grid aspect-[17/22] min-h-[min(520px,45vh)] place-items-center p-[30px] text-center text-xs text-muted-foreground",
  paperSkeleton: "grid w-[min(380px,70%)] gap-4 motion-safe:animate-pulse",
  paperSkeletonLine: "h-2 rounded-full bg-muted",
  paperSkeletonLineShort: "w-2/3",
  paperSkeletonBlock: "mt-3 h-28 rounded-xl bg-muted",
  canvasNotice:
    "absolute right-3 top-3 z-10 rounded-full border border-border bg-card px-3 py-1.5 text-2xs font-medium text-primary shadow-sm",
  canvasNoticeError: "text-destructive",
  changeOverlay: `${ui.focus} pointer-events-auto absolute cursor-pointer border border-primary/45 bg-primary/5 transition-[border-color,background-color,box-shadow]`,
  changeOverlayAdded: "border-success/50 bg-success/5",
  changeOverlayRemoved: "border-destructive/50 bg-destructive/5",
  changeOverlayCurrent: "border-primary bg-primary/12 ring-2 ring-primary/25",
  swipeWrap: "relative overflow-hidden",
  swipeSizer: "block h-auto min-h-[min(520px,45vh)] w-full select-none object-contain opacity-0",
  swipeLayer: "pointer-events-none absolute inset-0 z-0 overflow-hidden",
  swipeLayerImage: "block h-auto min-h-[min(520px,45vh)] w-full select-none object-contain",
  swipeHandle: `${ui.focus} pointer-events-auto absolute bottom-0 top-0 z-[1] flex w-6 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center`,
  swipeDivider: "pointer-events-none absolute bottom-0 top-0 w-0.5 bg-primary ring-1 ring-white/60",
  semanticPaper: "min-h-[min(520px,45vh)] overflow-hidden bg-card",
  semanticSummary:
    "flex items-center justify-between gap-3 border-b border-border bg-secondary px-5 py-3 text-2xs font-medium text-muted-foreground",
  semanticLegend:
    "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card px-5 py-2 text-3xs font-medium text-muted-foreground",
  semanticLegendDot: "mr-1 inline-block size-2 rounded-full align-[-1px]",
  semanticLegendAdded: "bg-success",
  semanticLegendRemoved: "bg-destructive",
  semanticLegendChanged: "bg-primary",
  semanticLegendNote: "ml-auto basis-full md:basis-auto",
  semanticGrid: "grid min-h-[min(470px,45vh)] grid-cols-1 gap-px bg-stage md:grid-cols-2",
  semanticColumn: "min-w-0 bg-background",
  semanticHeader: `${ui.caps} border-b border-border bg-card px-5 py-3`,
  semanticViewport: "relative w-full overflow-hidden bg-white",
  semanticPageImage: "relative z-0 block h-auto w-full select-none",
  semanticOverlay: "pointer-events-none absolute inset-0 z-[1] size-full overflow-visible",
  semanticOverlayPolygon:
    "pointer-events-auto cursor-pointer stroke-1 opacity-40 outline-none transition-[opacity,filter] focus-visible:opacity-90 focus-visible:brightness-90",
  semanticOverlayAdded: "fill-success stroke-success",
  semanticOverlayRemoved: "fill-destructive stroke-destructive",
  semanticOverlayChanged: "fill-primary stroke-primary",
  semanticOverlayCurrent: "opacity-85 stroke-foreground [stroke-width:1.5]",
  semanticNoText: "border-t border-border bg-secondary px-5 py-3 text-xs text-muted-foreground",
  changeOverlayLegend:
    "pointer-events-none absolute bottom-4 left-4 inline-flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-3xs font-semibold text-muted-foreground",
  changeOverlayKey: "inline-flex items-center gap-1",
  changeOverlayDot: "size-2 rounded-full",
  changeBar: "flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-border bg-card px-4 py-2",
  changeCount: "text-2xs font-semibold tabular-nums text-foreground",
  changeCrops: "mt-2 grid w-full grid-cols-2 gap-3",
  statusFooter:
    "relative flex min-h-9 items-center justify-between gap-3 border-t border-border bg-card px-4 text-3xs font-medium text-muted-foreground",
  statusAccent: "text-foreground",
  statusProgress: "absolute inset-x-0 top-0 h-0.5 bg-secondary",
  statusProgressFill: "h-full bg-primary transition-[width] duration-200",
  dialogBackdrop: "fixed inset-0 z-50 grid place-items-center bg-foreground/50 p-0 backdrop-blur-sm sm:p-4",
  settingsDialog: `${ui.dialog} max-h-[min(88vh,640px)] w-[min(92vw,420px)]`,
  settingsBody: "min-h-0 overflow-y-auto px-5 py-5",
  settingsGroup: "not-first:mt-6",
  settingsGroupTitle: `${ui.caps} m-0`,
  settingsRow: "mt-3 flex items-center justify-between gap-3 text-xs font-medium text-foreground",
  settingsNote: "mt-2 text-2xs leading-relaxed text-muted-foreground",
  settingsCheckbox: `${ui.focus} pdfdiff-switch`,
  helpDialog: cx(
    ui.dialog,
    "h-full max-h-full w-full rounded-none sm:h-auto sm:max-h-[min(88vh,780px)] sm:w-[min(92vw,820px)] sm:rounded-xl",
  ),
  helpHeader: "flex shrink-0 items-start justify-between gap-5 border-b border-border bg-card px-4 py-5 sm:px-6",
  helpTitle: "m-0 text-xl font-semibold tracking-tight",
  helpBody: "min-h-0 overflow-y-auto px-4 py-6 sm:px-6",
  helpSection: "not-first:mt-7",
  helpSectionTitle: `${ui.caps} m-0`,
  helpSteps: "mt-3 grid grid-cols-1 gap-3 md:grid-cols-3",
  helpStep: "rounded-xl border border-border bg-background p-3.5",
  helpStepTitle: "mt-3 text-sm font-semibold tracking-tight",
  helpStepCopy: "mt-1.5 text-xs leading-normal text-muted-foreground",
  helpModeList: "mt-3 grid grid-cols-1 gap-x-5 gap-y-2 text-xs md:grid-cols-2",
  helpMode: "leading-normal text-muted-foreground",
  helpModeName: "font-semibold text-foreground",
  helpShortcutGrid: "mt-3 grid grid-cols-1 gap-x-5 gap-y-2 md:grid-cols-2",
  helpShortcut: "flex items-start gap-2 text-2xs leading-normal text-muted-foreground",
  helpKey:
    "shrink-0 rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-3xs font-semibold text-foreground",
  helpNote: "mt-6 rounded-xl border border-success/25 bg-success/5 px-3.5 py-3 text-xs leading-normal text-success-ink",
  helpFooter: "flex shrink-0 items-center justify-end border-t border-border bg-secondary px-4 py-3 sm:px-6",
} as const;
