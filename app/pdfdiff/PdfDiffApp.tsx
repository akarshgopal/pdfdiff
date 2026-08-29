"use client";

import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DiffMetricSink, DiffOptions as CoreDiffOptions } from "@pdfdiff/core";
import { PdfDiffViewer, type DiffComparison, type DiffViewMode } from "@pdfdiff/viewer-react";
import { styles, styleProps } from "./styles";
import { LoadingScreen } from "./LoadingScreen";
import { UploadScreen } from "./UploadScreen";

export type DiffOptions = CoreDiffOptions;

export interface PdfDiffEngine {
  compare(request: {
    earlier: File;
    newer: File;
    options: DiffOptions;
    signal: AbortSignal;
    onProgress?: (progress: { completed: number; total: number }) => void;
    onMetric?: DiffMetricSink;
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
  onMetric?: DiffMetricSink;
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

export default function PdfDiffApp({ engine, initialComparison, onAnalytics, onMetric }: PdfDiffAppProps) {
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
    comparison?.dispose?.();
    if (side === "earlier") setEarlierFile(file);
    else setNewerFile(file);
    setError(null);
    setComparison(null);
    setPhase("upload");
  }, [comparison]);

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
        onMetric,
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
    comparison?.dispose?.();
    setComparison(null);
    setError(null);
    setPhase("upload");
    setProgress(0);
  };

  useEffect(() => () => {
    abortRef.current?.abort();
    comparison?.dispose?.();
  }, [comparison]);

  if (phase === "upload") {
    return <UploadScreen earlierFile={earlierFile} newerFile={newerFile} activeDrop={activeDrop} error={error} onChoose={chooseFile} onRemove={(side) => setFile(side, null)} onActive={(side, active) => setActiveDrop(active ? side : null)} onDrop={handleDrop} onInput={handleInput} onSwap={swapFiles} onCompare={() => void runComparison()} onHelp={() => document.getElementById("how-to-heading")?.scrollIntoView({ behavior: "smooth" })} inputEarlier={inputEarlier} inputNewer={inputNewer} />;
  }

  if (phase === "loading") {
    return <LoadingScreen progress={progress} />;
  }

  if (!comparison) return null;
  return <main {...styleProps(styles.root)}><div {...styleProps(styles.shell)}><PdfDiffViewer comparison={comparison} initialOptions={options} onOptionsChange={setOptions} onNewComparison={reset} onAnalytics={(event) => onAnalytics?.(event)} /></div></main>;
}

export { PdfDiffApp };
