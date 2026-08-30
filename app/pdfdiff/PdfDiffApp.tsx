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
import { ThemeToggle } from "../../components/ui/theme-toggle";
import { styles, styleProps } from "./styles";
import { LoadingScreen } from "./LoadingScreen";
import { UploadScreen } from "./UploadScreen";
import {
  clearComparisonHistory,
  listComparisonHistory,
  saveComparisonHistory,
  type ComparisonHistorySummary,
} from "./comparisonHistory";

export type DiffOptions = CoreDiffOptions;

export interface PdfDiffEngine {
  compare(request: {
    earlier: File;
    newer: File;
    options: DiffOptions;
    signal: AbortSignal;
    onReady?: (event: {
      earlierName: string;
      newerName: string;
      earlierPageCount: number;
      newerPageCount: number;
      total: number;
    }) => void;
    onPage?: (page: DiffComparison["pages"][number]) => void;
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

interface ComparisonInput {
  earlierFile: File;
  newerFile: File;
  options: DiffOptions;
  historyId?: string;
}

function progressPercent(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

function comparisonErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to compare these PDFs.";
}

async function rememberComparison(input: ComparisonInput, refreshHistory: () => Promise<void>): Promise<void> {
  try {
    await saveComparisonHistory({ id: input.historyId, ...input });
    await refreshHistory();
  } catch {
    // A full or unavailable browser store should never hide a completed comparison.
  }
}

export default function PdfDiffApp({ engine, initialComparison, onAnalytics, onMetric }: PdfDiffAppProps) {
  const activeEngine = engine ?? lazyBrowserEngine;
  const [earlierFile, setEarlierFile] = useState<File | null>(null);
  const [newerFile, setNewerFile] = useState<File | null>(null);
  const [comparison, setComparison] = useState<DiffComparison | null>(initialComparison ?? null);
  const [phase, setPhase] = useState<"upload" | "loading" | "workspace">(initialComparison ? "workspace" : "upload");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [pageProgress, setPageProgress] = useState<{ completed: number; total: number } | null>(null);
  const [activeDrop, setActiveDrop] = useState<"earlier" | "newer" | null>(null);
  const [options, setOptions] = useState<DiffOptions>({ sensitivity: 28, alignment: "none" });
  const [history, setHistory] = useState<ComparisonHistorySummary[]>([]);
  const inputEarlier = useRef<HTMLInputElement>(null);
  const inputNewer = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const repeatedHistoryRef = useRef<ComparisonHistorySummary | null>(null);
  const repeatedHistoryIdRef = useRef<string | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await listComparisonHistory());
    } catch {
      // Private browsing and storage policies can disable IndexedDB. Comparing still works.
      setHistory([]);
    }
  }, []);

  const setFile = useCallback((side: "earlier" | "newer", file: File | null) => {
    comparison?.dispose?.();
    if (side === "earlier") setEarlierFile(file);
    else setNewerFile(file);
    setError(null);
    setComparison(null);
    setPhase("upload");
  }, [comparison]);

  const chooseFile = (side: "earlier" | "newer") => {
    repeatedHistoryIdRef.current = null;
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
    const selectedFiles = Array.from(event.target.files ?? []);
    const repeated = repeatedHistoryRef.current;
    if (repeated && selectedFiles.length === 2) {
      const earlierMatch = selectedFiles.find((file) => file.name === repeated.earlierName);
      const newerMatch = selectedFiles.find((file) => file.name === repeated.newerName && file !== earlierMatch);
      acceptFiles("earlier", earlierMatch && newerMatch ? [earlierMatch, newerMatch] : selectedFiles);
    } else {
      acceptFiles(side, selectedFiles);
    }
    repeatedHistoryRef.current = null;
    event.target.value = "";
  };

  const handleDrop = (side: "earlier" | "newer", event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    repeatedHistoryIdRef.current = null;
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

  const runComparison = async (input: ComparisonInput) => {
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setError(null);
    setPhase("loading");
    setProgress(0);
    setPageProgress(null);
    onAnalytics?.({ name: "comparison_started", earlierSizeBucket: sizeBucket(input.earlierFile.size), newerSizeBucket: sizeBucket(input.newerFile.size) });
    try {
      const result = await activeEngine.compare({
        earlier: input.earlierFile,
        newer: input.newerFile,
        options: input.options,
        signal: abortController.signal,
        onReady: ({ earlierName, newerName, earlierPageCount, newerPageCount, total }) => {
          if (abortRef.current !== abortController || abortController.signal.aborted) return;
          setComparison({
            earlierName,
            newerName,
            earlierPageCount,
            newerPageCount,
            pages: Array.from({ length: total }, (_, index) => ({ index, status: "processing" as const })),
          });
          setPageProgress({ completed: 0, total });
          setPhase("workspace");
        },
        onPage: (page) => {
          if (abortRef.current !== abortController || abortController.signal.aborted) return;
          setComparison((current) => current ? {
            ...current,
            pages: current.pages.map((existing) => existing.index === page.index ? page : existing),
          } : current);
        },
        onProgress: ({ completed, total }) => {
          if (abortRef.current !== abortController || abortController.signal.aborted) return;
          setProgress(progressPercent(completed, total));
          setPageProgress({ completed, total });
        },
        onMetric,
      });
      if (abortController.signal.aborted) return;
      setComparison(result);
      setPhase("workspace");
      setProgress(100);
      setPageProgress(null);
      onAnalytics?.({ name: "comparison_completed", pageCount: result.pages.length, changedPageCount: result.pages.filter((page) => page.status !== "same").length });
      await rememberComparison(input, refreshHistory);
    } catch (comparisonError) {
      if (abortController.signal.aborted) return;
      setError(comparisonErrorMessage(comparisonError));
      setPhase("upload");
      onAnalytics?.({ name: "comparison_failed", errorCode: "compare_failed" });
    }
  };

  const runSelectedComparison = () => {
    if (!earlierFile || !newerFile) return;
    const historyId = repeatedHistoryIdRef.current ?? undefined;
    repeatedHistoryIdRef.current = null;
    void runComparison({ earlierFile, newerFile, options, historyId });
  };

  const repeatComparison = (id: string) => {
    const saved = history.find((item) => item.id === id);
    if (!saved) return;
    repeatedHistoryRef.current = saved;
    repeatedHistoryIdRef.current = saved.id;
    setOptions(saved.options);
    setError(`Select ${saved.earlierName} and ${saved.newerName} again. You can choose both files at once.`);
    inputEarlier.current?.click();
  };

  const clearHistory = async () => {
    if (!window.confirm("Clear all recent comparison details from this browser?")) return;
    try {
      await clearComparisonHistory();
      setHistory([]);
    } catch {
      setError("Unable to clear comparison history.");
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    comparison?.dispose?.();
    setComparison(null);
    setError(null);
    setPhase("upload");
    setProgress(0);
    setPageProgress(null);
  };

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => () => {
    comparison?.dispose?.();
  }, [comparison]);

  useEffect(() => {
    let active = true;
    void listComparisonHistory().then(
      (items) => {
        if (active) setHistory(items);
      },
      () => {
        if (active) setHistory([]);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (phase === "upload") {
    return <UploadScreen earlierFile={earlierFile} newerFile={newerFile} activeDrop={activeDrop} error={error} history={history} onChoose={chooseFile} onRemove={(side) => setFile(side, null)} onActive={(side, active) => setActiveDrop(active ? side : null)} onDrop={handleDrop} onInput={handleInput} onSwap={swapFiles} onCompare={runSelectedComparison} onRepeat={repeatComparison} onClearHistory={() => void clearHistory()} onHelp={() => document.getElementById("how-to-heading")?.scrollIntoView({ behavior: "smooth" })} inputEarlier={inputEarlier} inputNewer={inputNewer} />;
  }

  if (phase === "loading") {
    return <LoadingScreen progress={progress} />;
  }

  if (!comparison) return null;
  return <main {...styleProps(styles.root)}><div {...styleProps(styles.shell)}><PdfDiffViewer comparison={comparison} processingProgress={pageProgress ?? undefined} headerActions={<ThemeToggle />} initialOptions={options} onOptionsChange={setOptions} onNewComparison={reset} onAnalytics={(event) => onAnalytics?.(event)} /></div></main>;
}

export { PdfDiffApp };
