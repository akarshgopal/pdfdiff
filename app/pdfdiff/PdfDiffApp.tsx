"use client";

import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DiffOptions as CoreDiffOptions } from "@pdfdiff/core";
import { PdfDiffViewer, type DiffComparison, type DiffViewMode } from "@pdfdiff/viewer-react";
import { Button } from "../../components/ui/button";
import { FileDropzone } from "../../components/ui/file-dropzone";
import { ThemeToggle } from "../../components/ui/theme-toggle";
import { styles, styleProps } from "./styles";

export type DiffOptions = CoreDiffOptions;

export interface PdfDiffEngine {
  compare(request: {
    earlier: File;
    newer: File;
    options: DiffOptions;
    signal: AbortSignal;
    onProgress?: (progress: { completed: number; total: number }) => void;
  }): Promise<DiffComparison>;
}

export type PdfDiffAnalyticsEvent =
  | { name: "comparison_started"; earlierSizeBucket: string; newerSizeBucket: string }
  | { name: "comparison_completed"; pageCount: number; changedPageCount: number }
  | { name: "comparison_failed"; errorCode: string }
  | { name: "view_mode_used"; mode: DiffViewMode };

export interface PdfDiffAppProps {
  engine?: PdfDiffEngine;
  initialComparison?: DiffComparison;
  onAnalytics?: (event: PdfDiffAnalyticsEvent) => void;
}

const lazyBrowserEngine: PdfDiffEngine = {
  async compare(request) {
    const { browserPdfDiffEngine } = await import("../PdfDiffEngine");
    return browserPdfDiffEngine.compare(request);
  },
};

const MAX_FILE_SIZE = 150 * 1024 * 1024;

function sizeBucket(bytes: number): string {
  if (bytes < 2 * 1024 * 1024) return "small";
  if (bytes < 20 * 1024 * 1024) return "medium";
  if (bytes < 80 * 1024 * 1024) return "large";
  return "very_large";
}

function normalizeFile(file: File | undefined): File | null {
  if (!file) return null;
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? file : null;
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
  const [options, setOptions] = useState<DiffOptions>({ sensitivity: 28, alignment: "none" });
  const inputEarlier = useRef<HTMLInputElement>(null);
  const inputNewer = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const setFile = useCallback((side: "earlier" | "newer", file: File | null) => {
    if (side === "earlier") setEarlierFile(file);
    else setNewerFile(file);
    setError(null);
    setComparison(null);
    setPhase("upload");
  }, []);

  const chooseFile = (side: "earlier" | "newer") => {
    if (side === "earlier") inputEarlier.current?.click();
    else inputNewer.current?.click();
  };

  const acceptFiles = (side: "earlier" | "newer", selectedFiles: File[]) => {
    if (selectedFiles.length > 2 || selectedFiles.some((file) => !normalizeFile(file))) {
      setError("Choose one or two PDF files.");
      return;
    }
    const files = selectedFiles.map((file) => normalizeFile(file) as File);
    if (files.some((file) => file.size > MAX_FILE_SIZE)) {
      setError("That PDF exceeds the 150 MB limit. Choose a smaller file.");
      return;
    }
    setFile(side, files[0] ?? null);
    if (files[1]) setFile(side === "earlier" ? "newer" : "earlier", files[1]);
  };

  const handleInput = (side: "earlier" | "newer", event: ChangeEvent<HTMLInputElement>) => {
    acceptFiles(side, Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleDrop = (side: "earlier" | "newer", event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setActiveDrop(null);
    const file = normalizeFile(event.dataTransfer.files?.[0]);
    if (!file) {
      setError("Drop a PDF file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("That PDF exceeds the 150 MB limit. Choose a smaller file.");
      return;
    }
    setFile(side, file);
  };

  const swapFiles = () => {
    setEarlierFile(newerFile);
    setNewerFile(earlierFile);
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
        options,
        signal: abortController.signal,
        onProgress: ({ completed, total }) => setProgress(total ? Math.round((completed / total) * 100) : 0),
      });
      if (abortController.signal.aborted) return;
      setComparison(result);
      setPhase("workspace");
      setProgress(100);
      onAnalytics?.({ name: "comparison_completed", pageCount: result.pages.length, changedPageCount: result.pages.filter((page) => page.status !== "same").length });
    } catch (comparisonError) {
      if (abortController.signal.aborted) return;
      setError(comparisonError instanceof Error ? comparisonError.message : "Unable to compare these PDFs.");
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
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  if (phase === "upload") {
    return (
      <main {...styleProps(styles.root)}>
        <div {...styleProps(styles.shell)}>
          <header {...styleProps(styles.topbar)}><div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div><div {...styleProps(styles.topbarActions)}><div {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> Files stay on your device</div><button {...styleProps(styles.helpButton)} type="button" onClick={() => document.getElementById("how-to-heading")?.scrollIntoView({ behavior: "smooth" })}><span {...styleProps(styles.helpButtonMark)} aria-hidden="true">?</span> How it works</button><ThemeToggle /></div></header>
          <section {...styleProps(styles.intro)} aria-labelledby="upload-heading">
            <p {...styleProps(styles.eyebrow)}>PDF comparison</p>
            <h1 id="upload-heading" {...styleProps(styles.headline)}>Compare PDFs.<br /><em {...styleProps(styles.headlineAccent)}>Spot the difference.</em></h1>
            <p {...styleProps(styles.introCopy)}>Drop two versions to review what changed, page by page. Or select both PDFs from either picker; the first fills the card you opened.</p>
            <div {...styleProps(styles.uploadGrid)}><FileDropzone label="Earlier" description="Original PDF" file={earlierFile} active={activeDrop === "earlier"} onChoose={() => chooseFile("earlier")} onRemove={() => setFile("earlier", null)} onActive={(active) => setActiveDrop(active ? "earlier" : null)} onDrop={(event) => handleDrop("earlier", event)} /><button {...styleProps(styles.swapUpload)} type="button" aria-label="Swap earlier and newer files" onClick={swapFiles}>↔</button><FileDropzone label="Newer" description="Revised PDF" file={newerFile} active={activeDrop === "newer"} onChoose={() => chooseFile("newer")} onRemove={() => setFile("newer", null)} onActive={(active) => setActiveDrop(active ? "newer" : null)} onDrop={(event) => handleDrop("newer", event)} /></div>
            <input ref={inputEarlier} {...styleProps(styles.srOnly)} type="file" multiple accept="application/pdf,.pdf" aria-label="Choose one or two PDFs for earlier and newer" onChange={(event) => handleInput("earlier", event)} />
            <input ref={inputNewer} {...styleProps(styles.srOnly)} type="file" multiple accept="application/pdf,.pdf" aria-label="Choose one or two PDFs for newer and earlier" onChange={(event) => handleInput("newer", event)} />
            <Button size="lg" className={styles.compareButton} disabled={!earlierFile || !newerFile} onClick={() => void runComparison()}>Compare PDFs <span aria-hidden="true">→</span></Button>
            {error ? <div {...styleProps(styles.errorBox)} role="alert">{error}</div> : null}
            <section {...styleProps(styles.howTo)} aria-labelledby="how-to-heading"><div {...styleProps(styles.howToHeader)}><p {...styleProps(styles.eyebrow)}>How it works</p><h2 id="how-to-heading" {...styleProps(styles.howToTitle)}>A clear path from revision to review.</h2><p {...styleProps(styles.howToCopy)}>PDF Diff turns two versions into a focused review workspace. Everything happens locally, so you can move from upload to evidence without sending the documents anywhere.</p></div><div {...styleProps(styles.howToGrid)}><article {...styleProps(styles.howToCard)}><span {...styleProps(styles.howToStep)}>1</span><h3 {...styleProps(styles.howToCardTitle)}>Load both versions</h3><p {...styleProps(styles.howToCardCopy)}>Add the original to Earlier and the revision to Newer. Drop files or browse, then swap them if needed.</p></article><article {...styleProps(styles.howToCard)}><span {...styleProps(styles.howToStep)}>2</span><h3 {...styleProps(styles.howToCardTitle)}>Compare page by page</h3><p {...styleProps(styles.howToCardCopy)}>The browser renders each page, finds visual differences, and checks the extracted text.</p></article><article {...styleProps(styles.howToCard)}><span {...styleProps(styles.howToStep)}>3</span><h3 {...styleProps(styles.howToCardTitle)}>Inspect the evidence</h3><p {...styleProps(styles.howToCardCopy)}>Switch views, zoom in, select regions, and use Next changed page to work through the review.</p></article></div><div {...styleProps(styles.featureGrid)}><div {...styleProps(styles.featureCard)}><strong {...styleProps(styles.featureTitle)}>Local by design</strong><p {...styleProps(styles.featureCopy)}>PDFs stay on this device while they are processed.</p></div><div {...styleProps(styles.featureCard)}><strong {...styleProps(styles.featureTitle)}>Seven ways to compare</strong><p {...styleProps(styles.featureCopy)}>Diff, semantic text, side by side, swipe, blink, Earlier, and Newer.</p></div><div {...styleProps(styles.featureCard)}><strong {...styleProps(styles.featureTitle)}>Review-ready detail</strong><p {...styleProps(styles.featureCopy)}>Page status, change regions, text changes, and full-page views.</p></div></div></section>
          </section>
        </div>
      </main>
    );
  }

  if (phase === "loading") {
    return <main {...styleProps(styles.root)}><div {...styleProps(styles.shell)}><header {...styleProps(styles.topbar)}><div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div><div {...styleProps(styles.topbarActions)}><div {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> Processing</div><ThemeToggle /></div></header><section {...styleProps(styles.loading)} aria-live="polite" aria-busy="true"><div {...styleProps(styles.loadingCard)}><div {...styleProps(styles.loadingMark)} aria-hidden="true">◐</div><h1 {...styleProps(styles.loadingTitle)}>Comparing your PDFs</h1><p {...styleProps(styles.loadingCopy)}>Rendering pages and finding changes.</p><div {...styleProps(styles.progressTrack)}><div {...styleProps(styles.progressFill)} style={{ width: `${progress}%` }} /></div><p {...styleProps(styles.progressLabel)}>{progress ? `${progress}% complete` : "Preparing pages…"}</p></div></section></div></main>;
  }

  if (!comparison) return null;
  return <main {...styleProps(styles.root)}><div {...styleProps(styles.shell)}><PdfDiffViewer comparison={comparison} initialOptions={options} onOptionsChange={setOptions} onNewComparison={reset} onAnalytics={(event) => onAnalytics?.(event)} /></div></main>;
}

export { PdfDiffApp };
