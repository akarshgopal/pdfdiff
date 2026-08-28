"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "../../components/ui/button";
import { styles, styleProps, type TailwindClass } from "./styles";

/**
 * The UI deliberately depends on this small boundary instead of knowing how
 * PDF.js, workers, or a future WebGPU backend are wired. The parent can pass
 * an implementation from ../../lib/pdfdiff as `engine`.
 */
export type DiffViewMode =
  | "diff"
  | "side-by-side"
  | "swipe"
  | "blink"
  | "earlier"
  | "newer";

export type AlignmentMode = "none" | "translation";

export type DiffRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: "added" | "removed" | "changed";
  label?: string;
};

export type DiffTextChange = {
  id: string;
  text: string;
  kind: "added" | "removed" | "changed";
  pageX?: number;
  pageY?: number;
};

export type DiffPage = {
  index: number;
  width?: number;
  height?: number;
  status?: "same" | "changed" | "added" | "removed" | "processing" | "error";
  beforeSrc?: string;
  afterSrc?: string;
  diffSrc?: string;
  changedPixels?: number;
  changedPercent?: number;
  regions?: DiffRegion[];
  textChanges?: DiffTextChange[];
  error?: string;
};

export type DiffComparison = {
  earlierName: string;
  newerName: string;
  pages: DiffPage[];
  elapsedMs?: number;
};

export type DiffOptions = {
  sensitivity: number;
  alignment: AlignmentMode;
};

export type PdfDiffEngine = {
  compare: (request: {
    earlier: File;
    newer: File;
    options: DiffOptions;
    signal: AbortSignal;
    onProgress?: (progress: { completed: number; total: number }) => void;
  }) => Promise<DiffComparison>;
};

export type PdfDiffAnalyticsEvent =
  | { name: "comparison_started"; earlierSizeBucket: string; newerSizeBucket: string }
  | { name: "comparison_completed"; pageCount: number; changedPageCount: number }
  | { name: "comparison_failed"; errorCode: string }
  | { name: "view_mode_used"; mode: DiffViewMode };

export type PdfDiffAppProps = {
  engine?: PdfDiffEngine;
  initialComparison?: DiffComparison;
  onAnalytics?: (event: PdfDiffAnalyticsEvent) => void;
};

const lazyBrowserEngine: PdfDiffEngine = {
  async compare(request) {
    const { browserPdfDiffEngine } = await import("../PdfDiffEngine");
    return browserPdfDiffEngine.compare(request);
  },
};

const MAX_FILE_SIZE = 150 * 1024 * 1024;
const viewModes: Array<{ id: DiffViewMode; label: string; shortcut: string }> = [
  { id: "diff", label: "Diff", shortcut: "1" },
  { id: "side-by-side", label: "Side by side", shortcut: "2" },
  { id: "swipe", label: "Swipe", shortcut: "3" },
  { id: "blink", label: "Blink", shortcut: "4" },
  { id: "earlier", label: "Earlier", shortcut: "5" },
  { id: "newer", label: "Newer", shortcut: "6" },
];

const zoomLevels = [50, 75, 100, 125, 150, 200] as const;


function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function sizeBucket(bytes: number): string {
  if (bytes < 2 * 1024 * 1024) return "small";
  if (bytes < 20 * 1024 * 1024) return "medium";
  if (bytes < 80 * 1024 * 1024) return "large";
  return "very_large";
}

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

function zoomStyle(zoom: number) {
  return styles[`paperZoom${zoom}` as keyof typeof styles] as TailwindClass;
}

function swipeStyle(value: number) {
  const rounded = Math.min(100, Math.max(10, Math.round(value / 10) * 10));
  return styles[`swipe${rounded}` as keyof typeof styles] as TailwindClass;
}

function getRegionStyle(region: DiffRegion): CSSProperties {
  const x = `${Math.max(0, Math.min(100, region.x))}%`;
  const y = `${Math.max(0, Math.min(100, region.y))}%`;
  const width = `${Math.max(0.5, Math.min(100, region.width))}%`;
  const height = `${Math.max(0.5, Math.min(100, region.height))}%`;
  // These CSS custom properties are intentionally the only dynamic visual
  // values; the containing visual treatment remains a Tailwind class.
  return { left: x, top: y, width, height };
}

function FileGlyph() {
  return <span {...styleProps(styles.fileGlyph)} aria-hidden="true">PDF</span>;
}

function FileCard({
  side,
  file,
  active,
  onChoose,
  onRemove,
  onDrop,
  onActive,
}: {
  side: "earlier" | "newer";
  file: File | null;
  active: boolean;
  onChoose: () => void;
  onRemove: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onActive: (active: boolean) => void;
}) {
  const label = side === "earlier" ? "Earlier version" : "Newer version";
  const description = side === "earlier" ? "The baseline PDF" : "The PDF to compare against";

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChoose();
    }
  };

  return (
    <div
      {...styleProps(styles.uploadCard, active && styles.uploadCardActive, file && styles.uploadCardFilled)}
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${file ? file.name : "choose a PDF"}`}
      onClick={onChoose}
      onKeyDown={handleKeyDown}
      onDragEnter={(event) => {
        event.preventDefault();
        onActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => onActive(false)}
      onDrop={onDrop}
    >
      <div>
        <div {...styleProps(styles.uploadTop)}>
          <div>
            <span {...styleProps(styles.uploadLabel)}>{label}</span>
            <h2 {...styleProps(styles.uploadTitle)}>{file ? "Ready to compare" : description}</h2>
          </div>
          <span {...styleProps(styles.uploadIcon)} aria-hidden="true">{file ? "✓" : "+"}</span>
        </div>
        {file ? (
          <div {...styleProps(styles.fileRow)}>
            <FileGlyph />
            <div {...styleProps(styles.fileDetails)}>
              <span {...styleProps(styles.fileName)} title={file.name}>{file.name}</span>
              <span {...styleProps(styles.fileMeta)}>{formatFileSize(file.size)} · PDF document</span>
            </div>
            <button
              {...styleProps(styles.fileRemove)}
              type="button"
              aria-label={`Remove ${label.toLowerCase()} file`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <p {...styleProps(styles.uploadHint)}>Drop a PDF here, or choose one from your device. Files never leave this browser.</p>
        )}
      </div>
      <span {...styleProps(styles.uploadAction)}>{file ? "Replace PDF" : "Choose PDF →"}</span>
    </div>
  );
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
  return (
    <div {...styleProps(styles.paperEmpty)}>
      <div>
        <span {...styleProps(styles.placeholderTitle)} aria-hidden="true" />
        <p>{label}</p>
      </div>
    </div>
  );
}

function PagePreview({
  page,
  mode,
  zoom,
  swipe,
  blinkOn,
  selectedRegion,
  onRegionClick,
}: {
  page: DiffPage;
  mode: DiffViewMode;
  zoom: number;
  swipe: number;
  blinkOn: boolean;
  selectedRegion: string | null;
  onRegionClick: (region: DiffRegion) => void;
}) {
  const before = page.beforeSrc;
  const after = page.afterSrc;
  const diff = page.diffSrc;
  const canShowImages = Boolean(before || after || diff);
  const renderImage = (source: string | undefined, alt: string, imageStyle: TailwindClass = styles.pageImage) =>
    source ? <img {...styleProps(imageStyle)} src={source} alt={alt} draggable={false} /> : <PaperFallback label="Preview is still rendering" />;

  const overlays = mode === "diff" && page.regions?.length ? (
    <>
      {page.regions.map((region) => (
        <button
          key={region.id}
          type="button"
          aria-label={region.label ?? `${region.kind ?? "changed"} region`}
          title={region.label}
          {...styleProps(
            styles.changeOverlay,
            region.kind === "added" && styles.changeOverlayAdded,
            region.kind === "removed" && styles.changeOverlayRemoved,
            selectedRegion === region.id && styles.changeOverlayCurrent,
          )}
          onClick={() => onRegionClick(region)}
          style={getRegionStyle(region)}
        />
      ))}
    </>
  ) : null;

  if (!canShowImages) {
    return <div {...styleProps(styles.paper, zoomStyle(zoom))}><PaperFallback label={statusLabel(pageStatus(page))} /></div>;
  }

  if (mode === "side-by-side") {
    return (
      <div {...styleProps(styles.paper, zoomStyle(zoom))}>
        <div {...styleProps(styles.sideBySide)}>
          <div {...styleProps(styles.sidePanel)}>{renderImage(before, "Earlier version of this page")}</div>
          <div {...styleProps(styles.sidePanel)}>{renderImage(after, "Newer version of this page")}</div>
        </div>
      </div>
    );
  }

  if (mode === "swipe") {
    return (
      <div {...styleProps(styles.paper, styles.swipeWrap, zoomStyle(zoom))}>
        {renderImage(before, "Earlier version of this page")}
        {after ? <img {...styleProps(styles.swipeNewer, swipeStyle(swipe))} src={after} alt="Newer version of this page" draggable={false} /> : null}
        <span {...styleProps(styles.swipeDivider)} style={{ left: `${swipe}%` }} aria-hidden="true" />
      </div>
    );
  }

  if (mode === "blink") {
    return (
      <div {...styleProps(styles.paper, zoomStyle(zoom))}>
        {renderImage(blinkOn ? after : before, blinkOn ? "Newer version of this page" : "Earlier version of this page")}
        <span {...styleProps(styles.blinkBadge)}>{blinkOn ? "Newer" : "Earlier"}</span>
      </div>
    );
  }

  if (mode === "earlier") return <div {...styleProps(styles.paper, zoomStyle(zoom))}>{renderImage(before, "Earlier version of this page")}</div>;
  if (mode === "newer") return <div {...styleProps(styles.paper, zoomStyle(zoom))}>{renderImage(after, "Newer version of this page")}</div>;

  return (
    <div {...styleProps(styles.paper, zoomStyle(zoom))}>
      {diff ? renderImage(diff, "Visual diff of this page", styles.diffImage) : renderImage(before, "Earlier version of this page")}
      {!diff && page.status === "changed" ? (
        <div {...styleProps(styles.canvasCaption)}>
          <span {...styleProps(styles.captionDotAdded)} aria-hidden="true" />
          <span>Added</span>
          <span {...styleProps(styles.captionDotRemoved)} aria-hidden="true" />
          <span>Removed</span>
        </div>
      ) : null}
      {overlays}
    </div>
  );
}

function normalizeFile(file: File | undefined): File | null {
  if (!file) return null;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return file;
  return null;
}

export default function PdfDiffApp({ engine, initialComparison, onAnalytics }: PdfDiffAppProps) {
  const activeEngine = engine ?? lazyBrowserEngine;
  const [earlierFile, setEarlierFile] = useState<File | null>(null);
  const [newerFile, setNewerFile] = useState<File | null>(null);
  const [comparison, setComparison] = useState<DiffComparison | null>(initialComparison ?? null);
  const [phase, setPhase] = useState<"upload" | "loading" | "workspace">(initialComparison ? "workspace" : "upload");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeDrop, setActiveDrop] = useState<"earlier" | "newer" | null>(null);
  const [mode, setMode] = useState<DiffViewMode>("diff");
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState<number>(100);
  const [swipe, setSwipe] = useState(50);
  const [sensitivity, setSensitivity] = useState(28);
  const [alignment, setAlignment] = useState<AlignmentMode>("none");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [blinkOn, setBlinkOn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputEarlier = useRef<HTMLInputElement>(null);
  const inputNewer = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pages = useMemo(() => comparison?.pages ?? [], [comparison]);
  const currentPage = pages[pageIndex] ?? null;
  const changedPages = useMemo(() => pages.filter((page) => pageStatus(page) !== "same"), [pages]);
  const currentRegions = currentPage?.regions ?? [];
  const currentTextChanges = currentPage?.textChanges ?? [];
  const changedPercent = currentPage?.changedPercent ?? 0;

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (mode !== "blink") return;
    const timer = window.setInterval(() => setBlinkOn((value) => !value), 720);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (phase !== "workspace") return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.isContentEditable) return;
      const numberMode = viewModes.find((item) => item.shortcut === event.key);
      if (numberMode) {
        setMode(numberMode.id);
        onAnalytics?.({ name: "view_mode_used", mode: numberMode.id });
      } else if (event.key === "ArrowRight" || event.key === "j") {
        setPageIndex((index) => Math.min(index + 1, Math.max(0, pages.length - 1)));
      } else if (event.key === "ArrowLeft" || event.key === "k") {
        setPageIndex((index) => Math.max(0, index - 1));
      } else if (event.key === "Escape") {
        setSelectedRegion(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, onAnalytics, pages.length, phase]);

  const setFile = useCallback((side: "earlier" | "newer", file: File | null) => {
    if (side === "earlier") setEarlierFile(file);
    else setNewerFile(file);
    setError(null);
    setComparison(null);
    setPhase("upload");
    setPageIndex(0);
  }, []);

  const chooseFile = (side: "earlier" | "newer") => {
    if (side === "earlier") inputEarlier.current?.click();
    else inputNewer.current?.click();
  };

  const handleInput = (side: "earlier" | "newer", event: ChangeEvent<HTMLInputElement>) => {
    const file = normalizeFile(event.target.files?.[0]);
    if (!file) {
      setError("Please choose a PDF file. Other file types are not supported.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("That PDF is over 150 MB. Try a smaller export to keep processing fast and private.");
      event.target.value = "";
      return;
    }
    setFile(side, file);
    event.target.value = "";
  };

  const handleDrop = (side: "earlier" | "newer", event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setActiveDrop(null);
    const file = normalizeFile(event.dataTransfer.files?.[0]);
    if (!file) {
      setError("Please drop a PDF file. Other file types are not supported.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("That PDF is over 150 MB. Try a smaller export to keep processing fast and private.");
      return;
    }
    setFile(side, file);
  };

  const swapFiles = () => {
    setEarlierFile(newerFile);
    setNewerFile(earlierFile);
    if (comparison) {
      setComparison({ ...comparison, earlierName: comparison.newerName, newerName: comparison.earlierName });
    }
  };

  const runComparison = async () => {
    if (!earlierFile || !newerFile) return;
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setError(null);
    setPhase("loading");
    setProgress(0);
    onAnalytics?.({ name: "comparison_started", earlierSizeBucket: sizeBucket(earlierFile.size), newerSizeBucket: sizeBucket(newerFile.size) });

    try {
      const result = await activeEngine.compare({
        earlier: earlierFile,
        newer: newerFile,
        options: { sensitivity, alignment },
        signal: abortController.signal,
        onProgress: ({ completed, total }) => setProgress(total ? Math.round((completed / total) * 100) : 0),
      });
      if (abortController.signal.aborted) return;
      setComparison(result);
      setPageIndex(0);
      setSelectedRegion(null);
      setPhase("workspace");
      setProgress(100);
      onAnalytics?.({ name: "comparison_completed", pageCount: result.pages.length, changedPageCount: result.pages.filter((page) => pageStatus(page) !== "same").length });
    } catch (comparisonError) {
      if (abortController.signal.aborted) return;
      const message = comparisonError instanceof Error ? comparisonError.message : "Unable to compare these PDFs.";
      setError(message);
      setPhase("upload");
      onAnalytics?.({ name: "comparison_failed", errorCode: "compare_failed" });
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setEarlierFile(null);
    setNewerFile(null);
    setComparison(null);
    setError(null);
    setPhase("upload");
    setProgress(0);
    setPageIndex(0);
    setSelectedRegion(null);
  };

  const changeMode = (nextMode: DiffViewMode) => {
    setMode(nextMode);
    onAnalytics?.({ name: "view_mode_used", mode: nextMode });
  };

  const selectPage = (index: number) => {
    setPageIndex(index);
    setSelectedRegion(null);
  };

  const selectRegion = (region: DiffRegion) => setSelectedRegion(region.id);

  const goToNextChange = () => {
    if (!pages.length) return;
    const next = pages.findIndex((page, index) => index > pageIndex && pageStatus(page) !== "same");
    const fallback = pages.findIndex((page) => pageStatus(page) !== "same");
    setPageIndex(next >= 0 ? next : fallback >= 0 ? fallback : pageIndex);
    setSelectedRegion(null);
  };

  if (phase === "upload") {
    return (
      <main {...styleProps(styles.root)}>
        <div {...styleProps(styles.shell)}>
          <header {...styleProps(styles.topbar)}>
            <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
            <div {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> Runs locally in your browser</div>
          </header>
          <section {...styleProps(styles.intro)} aria-labelledby="upload-heading">
            <p {...styleProps(styles.eyebrow)}>Visual document comparison</p>
            <h1 id="upload-heading" {...styleProps(styles.headline)}>See every change.<br /><em {...styleProps(styles.headlineAccent)}>Miss nothing.</em></h1>
            <p {...styleProps(styles.introCopy)}>Compare drawings, schematics, and contracts page by page. Your files stay on this device from start to finish.</p>
            <div {...styleProps(styles.uploadGrid)}>
              <FileCard side="earlier" file={earlierFile} active={activeDrop === "earlier"} onChoose={() => chooseFile("earlier")} onRemove={() => setFile("earlier", null)} onActive={(active) => setActiveDrop(active ? "earlier" : null)} onDrop={(event) => handleDrop("earlier", event)} />
              <button {...styleProps(styles.swapUpload)} type="button" aria-label="Swap earlier and newer files" onClick={swapFiles}>↔</button>
              <FileCard side="newer" file={newerFile} active={activeDrop === "newer"} onChoose={() => chooseFile("newer")} onRemove={() => setFile("newer", null)} onActive={(active) => setActiveDrop(active ? "newer" : null)} onDrop={(event) => handleDrop("newer", event)} />
            </div>
            <input ref={inputEarlier} {...styleProps(styles.srOnly)} type="file" accept="application/pdf,.pdf" aria-label="Choose earlier PDF" onChange={(event) => handleInput("earlier", event)} />
            <input ref={inputNewer} {...styleProps(styles.srOnly)} type="file" accept="application/pdf,.pdf" aria-label="Choose newer PDF" onChange={(event) => handleInput("newer", event)} />
            <Button size="lg" className={styles.compareButton} disabled={!earlierFile || !newerFile} onClick={() => void runComparison()}>Compare PDFs <span aria-hidden="true">→</span></Button>
            {error ? <div {...styleProps(styles.errorBox)} role="alert">{error}</div> : null}
            <p {...styleProps(styles.uploadFooter)}><span {...styleProps(styles.footerShield)} aria-hidden="true">♢</span> No uploads · no accounts · no document data collected</p>
          </section>
        </div>
      </main>
    );
  }

  if (phase === "loading") {
    return (
      <main {...styleProps(styles.root)}>
        <div {...styleProps(styles.shell)}>
          <header {...styleProps(styles.topbar)}>
            <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
            <div {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> Working locally</div>
          </header>
          <section {...styleProps(styles.loading)} aria-live="polite" aria-busy="true">
            <div {...styleProps(styles.loadingCard)}>
              <div {...styleProps(styles.loadingMark)} aria-hidden="true">◐</div>
              <h1 {...styleProps(styles.loadingTitle)}>Comparing your PDFs</h1>
              <p {...styleProps(styles.loadingCopy)}>Rendering pages and finding meaningful visual changes. Nothing is being uploaded.</p>
              <div {...styleProps(styles.progressTrack)}><div {...styleProps(styles.progressFill)} style={{ width: `${progress}%` }} /></div>
              <p {...styleProps(styles.fileMeta)}>{progress ? `${progress}% complete` : "Preparing pages…"}</p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!comparison || !currentPage) return null;
  const status = pageStatus(currentPage);
  const pageCount = pages.length;
  const pageChangedCount = changedPages.length;

  return (
    <main {...styleProps(styles.root)}>
      <div {...styleProps(styles.shell)}>
        <header {...styleProps(styles.workspaceBar)}>
          <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
          <div {...styleProps(styles.documentPair)} aria-label="Compared documents">
            <div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>A</span><span {...styleProps(styles.documentChipName)} title={comparison.earlierName}>{comparison.earlierName}</span></div>
            <span {...styleProps(styles.pairArrow)} aria-hidden="true">↔</span>
            <div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>B</span><span {...styleProps(styles.documentChipName)} title={comparison.newerName}>{comparison.newerName}</span></div>
          </div>
          <div {...styleProps(styles.workspaceActions)}>
            <span {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> Local only</span>
            <Button variant="outline" size="sm" className={styles.quietButton} onClick={reset}>New comparison</Button>
          </div>
        </header>
        <div {...styleProps(styles.busyBar)} aria-hidden="true"><div {...styleProps(styles.busyBarFill)} style={{ width: `${progress}%` }} /></div>
        <div {...styleProps(styles.workspaceMain)}>
          <aside {...styleProps(styles.pageRail)} aria-label="Pages">
            <h2 {...styleProps(styles.railHeading)}>Pages <span aria-hidden="true">·</span> {pageCount}</h2>
            {pages.map((page, index) => {
              const pageState = pageStatus(page);
              return (
                <button key={page.index ?? index} {...styleProps(styles.pageButton, index === pageIndex && styles.pageButtonCurrent)} type="button" aria-label={`Page ${index + 1}, ${statusLabel(pageState)}`} aria-current={index === pageIndex ? "page" : undefined} onClick={() => selectPage(index)}>
                  <div {...styleProps(styles.pageThumb)}>{page.beforeSrc || page.afterSrc ? <img {...styleProps(styles.pageThumbImage)} src={page.beforeSrc ?? page.afterSrc} alt="" draggable={false} /> : <ThumbPlaceholder />} </div>
                  <div {...styleProps(styles.pageNumber)}><span>{index + 1}</span><span {...styleProps(styles.pageStatus, pageState === "changed" && styles.pageStatusChanged, pageState === "added" && styles.pageStatusAdded, pageState === "removed" && styles.pageStatusRemoved)}>{statusSymbol(pageState)}</span></div>
                </button>
              );
            })}
          </aside>
          <section {...styleProps(styles.canvasColumn)} aria-label="PDF comparison">
            <div {...styleProps(styles.toolbar)}>
              <div {...styleProps(styles.toolbarGroup)}>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => selectPage(Math.max(0, pageIndex - 1))}>←</button>
                <span {...styleProps(styles.zoomLabel)}>{pageIndex + 1} / {pageCount}</span>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Next page" disabled={pageIndex >= pageCount - 1} onClick={() => selectPage(Math.min(pageCount - 1, pageIndex + 1))}>→</button>
              </div>
              <div {...styleProps(styles.modeGroup)} role="toolbar" aria-label="View mode">
                {viewModes.map((item) => <button key={item.id} {...styleProps(styles.modeButton, mode === item.id && styles.modeButtonCurrent)} type="button" aria-pressed={mode === item.id} title={`${item.label} (${item.shortcut})`} onClick={() => changeMode(item.id)}><span {...styleProps(styles.desktopOnly)}>{item.label}</span><span {...styleProps(styles.mobileOnly)}>{item.shortcut}</span></button>)}
              </div>
              <div {...styleProps(styles.toolbarGroup)}>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom out" disabled={zoom === zoomLevels[0]} onClick={() => setZoom((value) => zoomLevels[Math.max(0, zoomLevels.indexOf(value as (typeof zoomLevels)[number]) - 1)] ?? 50)}>−</button>
                <span {...styleProps(styles.zoomLabel)}>{zoom}%</span>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom in" disabled={zoom === zoomLevels[zoomLevels.length - 1]} onClick={() => setZoom((value) => zoomLevels[Math.min(zoomLevels.length - 1, zoomLevels.indexOf(value as (typeof zoomLevels)[number]) + 1)] ?? 200)}>+</button>
              </div>
            </div>
            <div {...styleProps(styles.stage)}>
              <div {...styleProps(styles.stageCenter)}>
                <PagePreview page={currentPage} mode={mode} zoom={zoom} swipe={swipe} blinkOn={blinkOn} selectedRegion={selectedRegion} onRegionClick={selectRegion} />
              </div>
            </div>
            <div {...styleProps(styles.statusFooter)}>
              <span><span {...styleProps(styles.statusAccent)}>{status === "same" ? "No visual changes" : statusLabel(status)}</span> · page {pageIndex + 1}</span>
              <span>{alignment === "none" ? "Unaligned" : "Translation aligned"} · sensitivity {sensitivity}</span>
            </div>
          </section>
          <aside {...styleProps(styles.inspector)} aria-label="Change inspector">
            <h2 {...styleProps(styles.inspectorHeading)}>Change inspector</h2>
            <p {...styleProps(styles.inspectorSubheading)}>Review this page, then jump to the next changed page.</p>
            <div {...styleProps(styles.changeSummary)}>
              <div {...styleProps(styles.statCard)}><span {...styleProps(styles.statLabel)}>Changed pages</span><strong {...styleProps(styles.statValue, pageChangedCount > 0 && styles.statValueWarm)}>{pageChangedCount}</strong></div>
              <div {...styleProps(styles.statCard)}><span {...styleProps(styles.statLabel)}>Changed area</span><strong {...styleProps(styles.statValue, changedPercent > 0 && styles.statValueWarm)}>{changedPercent ? `${changedPercent.toFixed(2)}%` : "—"}</strong></div>
            </div>
            <Button className={styles.compareButton} onClick={goToNextChange}>Next changed page <span aria-hidden="true">→</span></Button>
            <div {...styleProps(styles.inspectorSection)}>
              <div {...styleProps(styles.sectionLabel)}><span>Regions</span><span>{currentRegions.length}</span></div>
              {currentRegions.length ? (
                <div {...styleProps(styles.changeList)}>{currentRegions.map((region, index) => <button key={region.id} {...styleProps(styles.changeButton, selectedRegion === region.id && styles.changeButtonCurrent)} type="button" onClick={() => selectRegion(region)}><span {...styleProps(styles.changeDot, region.kind === "added" && styles.changeDotAdded, region.kind === "removed" && styles.changeDotRemoved)} aria-hidden="true" /><span {...styleProps(styles.changeText)}>{region.label ?? `${region.kind ?? "Changed"} region ${index + 1}`}</span><span {...styleProps(styles.changeCount)}>#{index + 1}</span></button>)}</div>
              ) : <div {...styleProps(styles.emptyChanges)}>{status === "same" ? "This page is identical at the current sensitivity." : "No grouped regions were returned for this page."}</div>}
            </div>
            {currentTextChanges.length ? <div {...styleProps(styles.inspectorSection)}><div {...styleProps(styles.sectionLabel)}><span>Text changes</span><span>{currentTextChanges.length}</span></div><div {...styleProps(styles.changeList)}>{currentTextChanges.slice(0, 6).map((change) => <button key={change.id} {...styleProps(styles.changeButton)} type="button" onClick={() => setSelectedRegion(change.id)}><span {...styleProps(styles.changeDot, change.kind === "added" && styles.changeDotAdded, change.kind === "removed" && styles.changeDotRemoved)} aria-hidden="true" /><span {...styleProps(styles.changeText)}>{change.text}</span></button>)}</div></div> : null}
            <div {...styleProps(styles.inspectorSection)}>
              <button {...styleProps(styles.quietButton)} type="button" aria-expanded={showSettings} onClick={() => setShowSettings((value) => !value)}>{showSettings ? "Hide comparison settings" : "Comparison settings"}</button>
              {showSettings ? <div {...styleProps(styles.inspectorSection)}>
                <div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="sensitivity">Sensitivity</label><span {...styleProps(styles.controlValue)}>{sensitivity}</span></div>
                <input id="sensitivity" {...styleProps(styles.range)} type="range" min="0" max="100" value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} />
                <div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="alignment">Alignment</label><select id="alignment" {...styleProps(styles.select)} value={alignment} onChange={(event) => setAlignment(event.target.value as AlignmentMode)}><option value="none">None</option><option value="translation">Translation only</option></select></div>
                {mode === "swipe" ? <><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="swipe">Swipe position</label><span {...styleProps(styles.controlValue)}>{swipe}%</span></div><input id="swipe" {...styleProps(styles.range)} type="range" min="0" max="100" value={swipe} onChange={(event) => setSwipe(Number(event.target.value))} /></> : null}
              </div> : null}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export { PdfDiffApp };
