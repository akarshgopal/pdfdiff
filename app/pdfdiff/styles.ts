import { cx, ui } from "@pdfdiff/viewer-react/ui";

/** One page gutter and one content width for every screen. */
const gutter = "px-5 lg:px-8";
const container = "mx-auto w-full max-w-[1120px]";
/** Space between the three groups of the hero column: headline, the compare CTA, the CLI.
   Height-aware for the same reason the demo stage is: a short screen still fits. */
const sectionGap = "mt-[clamp(1.75rem,5vh,3.25rem)]";

export const styles = {
  root: "min-h-screen bg-background font-sans tracking-tight text-foreground",
  shell: "flex min-h-screen w-full flex-col",
  topbar: `${gutter} flex min-h-[56px] items-center justify-between gap-5 border-b border-border bg-card`,
  topbarActions: "flex items-center gap-2",
  githubLink: cx(
    ui.control,
    ui.focus,
    "size-8 no-underline hover:bg-background focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  ),
  logo: "inline-flex items-center gap-2.5 whitespace-nowrap text-base font-semibold tracking-tight text-foreground no-underline",
  logoMark: "grid size-[26px] place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground",
  intro: `${gutter} ${container} grid grid-cols-1 items-center gap-x-14 gap-y-10 pb-12 pt-10 text-center lg:pb-16 lg:pt-[clamp(36px,4.5vw,60px)] xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)] xl:text-left`,
  introMain: "flex flex-col items-center xl:items-start",
  eyebrow: cx(ui.caps, "m-0 text-primary"),
  headline: "text-[clamp(32px,4vw,48px)] font-semibold leading-display tracking-tighter",
  headlineAccent: "not-italic text-primary",
  introLead: "mt-3 max-w-md text-sm leading-relaxed text-muted-foreground",
  uploadGrid: `${sectionGap} grid w-full grid-cols-1 gap-3.5 lg:grid-cols-[1fr_auto_1fr]`,
  swapUpload: cx(
    ui.control,
    ui.focus,
    "z-[1] mx-auto -my-1 size-[42px] self-center rounded-full bg-background text-lg font-bold text-primary transition-transform duration-150 hover:rotate-180 hover:bg-accent hover:text-primary lg:mx-0 lg:my-0",
  ),
  rememberOption: `${ui.focus} group flex cursor-pointer items-center gap-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground`,
  /** Muted until both files are in, so it never outshouts the primary button. */
  rememberOptionIdle: "opacity-50 transition-opacity hover:opacity-100",
  rememberLabel: "relative",
  /** CSS-only tooltip: the native title delay is too slow for a short label.
      Right-anchored and clamped — an opacity-0 absolute box still widens the page. */
  rememberTip:
    "pointer-events-none absolute bottom-full right-0 z-10 mb-2 w-max max-w-[min(18rem,calc(100vw-3rem))] rounded-lg border border-border bg-popover px-2.5 py-1.5 text-2xs leading-normal text-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100",
  rememberCheckbox: `${ui.focus} pdfdiff-switch`,
  introActions: "mt-5 flex w-full flex-col items-center gap-3 xl:items-start",
  introActionsRow: "flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-3 xl:justify-start",
  compareButton: "min-h-12 px-6",
  demoColumn: "flex w-full flex-col",
  samples: "mt-5 flex w-full flex-col items-center gap-2 xl:items-start",
  samplesLabel: cx(ui.caps, "m-0"),
  samplesRow: "flex flex-wrap justify-center gap-2 xl:justify-start",
  sampleButton: cx(ui.control, ui.focus, "min-h-8 px-3"),
  cli: `${sectionGap} flex w-full flex-col items-center gap-2 xl:items-start`,
  cliLabel: "m-0 text-xs font-medium text-muted-foreground",
  cliRow: cx(ui.control, ui.focus, "w-full max-w-md justify-between gap-3 px-3 py-2 hover:bg-background"),
  cliCommand: "min-w-0 truncate font-mono text-2xs text-foreground",
  cliCopy: "size-4 shrink-0 text-muted-foreground",
  cliCopied: "size-4 shrink-0 text-success",
  cliLink: `${ui.focus} text-2xs font-medium text-primary underline-offset-4 hover:underline`,
  privacyNote: "inline-flex items-center gap-2 text-xs leading-relaxed text-muted-foreground",
  privacyIcon: "size-4 shrink-0 text-success",
  errorBox:
    "mt-4 w-full rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-left text-xs leading-normal text-destructive",
  pageDropActive: "outline-dashed outline-2 -outline-offset-4 outline-primary",
  history: cx(gutter, container, "mb-16 text-left"),
  historyHeader: "flex items-end justify-between gap-4",
  historyTitle: "m-0 text-[clamp(19px,2.2vw,24px)] font-semibold leading-tight tracking-tight",
  historyList: "mt-5 grid gap-2.5",
  historyCard: `${ui.card} grid grid-cols-1 items-center gap-x-5 gap-y-2 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_auto]`,
  historyFiles: "flex min-w-0 items-center gap-2 text-sm",
  historyFileName: "min-w-0 truncate font-medium",
  historyArrow: "shrink-0 text-primary",
  historyMeta: "flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground",
  historyResume: "justify-self-start md:col-start-2 md:row-span-2 md:row-start-1 md:justify-self-auto",
  historyNote: "mt-3 text-xs leading-relaxed text-muted-foreground",
  demo: `${ui.card} w-full overflow-hidden text-left`,
  demoBar: "flex items-center gap-2 border-b border-border bg-card px-3 py-2.5 text-2xs",
  demoChip: "min-w-0 truncate rounded-lg border border-border bg-background px-2 py-1 font-medium",
  demoArrow: "shrink-0 text-primary",
  demoCount: "ml-auto shrink-0 rounded-lg bg-primary/10 px-2 py-1 hidden font-medium text-primary sm:inline",
  /**
   * One stage height for every mode, so switching view never moves the page.
   * It tracks viewport height as well as width, so a short laptop screen still
   * gets header, hero and footer without scrolling.
   */
  demoStage:
    "grid h-[22.5rem] grid-rows-[minmax(0,1fr)] place-items-center bg-stage p-[clamp(0.625rem,2vw,1.375rem)] sm:h-[clamp(18.75rem,42vh,27.75rem)]",
  demoPage: "block h-auto max-h-full w-full max-w-[300px] rounded-sm border border-border shadow-sm",
  demoSplit: "grid h-full w-full grid-cols-2 place-items-center gap-2",
  demoSwipe: "relative aspect-[3/4] h-full w-auto max-w-[300px]",
  demoSwipeTop: "pdfdiff-swipe-top absolute inset-0",
  demoSwipeHandle: "pdfdiff-swipe-handle absolute inset-y-0 w-px -translate-x-1/2 bg-primary",
  demoFoot: "border-t border-border bg-card px-3 py-2.5",
  demoTabs: "inline-flex gap-1",
  demoTab: cx(ui.control, ui.focus, "min-h-7 border-transparent bg-transparent px-2.5 text-2xs"),
  demoTabCurrent: "border-border bg-background text-foreground",
  /** Two lines are reserved so a longer caption cannot resize the card. */
  demoCaption: "mt-2 min-h-[2lh] text-2xs leading-normal text-muted-foreground",
  footer: `${gutter} mt-auto border-t border-border bg-card`,
  footerInner: `${container} flex min-h-16 flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center`,
  footerLinks: "flex flex-wrap items-center gap-x-5 gap-y-2",
  footerLink: `${ui.focus} text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-offset-2 focus-visible:ring-offset-card`,
  loading: "grid min-h-[440px] flex-1 place-items-center p-8",
  loadingCard: `${ui.card} w-[min(390px,100%)] p-6 text-center`,
  loadingPreview: "relative mx-auto h-24 w-28 animate-pulse motion-reduce:animate-none",
  loadingPage: `${ui.card} absolute left-1 top-3 flex h-20 w-16 flex-col gap-2 p-3 shadow-sm`,
  loadingPageAfter: "left-auto right-1 top-0 bg-accent",
  loadingLine: "h-1 rounded-full bg-muted-foreground/20",
  loadingLineShort: "w-2/3",
  loadingBlock: "mt-auto h-7 rounded-lg bg-secondary",
  loadingChange: "mt-auto h-7 rounded-lg border border-border bg-primary/10",
  loadingTitle: "mt-4 text-lg font-semibold tracking-tight",
  loadingCopy: "mt-2 text-xs leading-normal text-muted-foreground",
  loadingCancel: "mt-4",
} as const;
