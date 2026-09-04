import {
  type ChangeEvent,
  type DragEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DiffMetricSink, DiffOptions as CoreDiffOptions } from "@pdfdiff/core";
import type { DiffComparison } from "@pdfdiff/viewer-react";

/**
 * The viewer only exists once there is something to view, and the engine it
 * needs is already loaded on demand — so the landing page ships neither.
 */
const PdfDiffViewer = lazy(async () => ({ default: (await import("@pdfdiff/viewer-react")).PdfDiffViewer }));
import { ThemeToggle } from "../../components/ui/theme-toggle";
import { styles, styleProps } from "./styles";
import { LoadingScreen } from "./LoadingScreen";
import { UploadScreen } from "./UploadScreen";
import {
  clearComparisonHistory,
  listComparisonHistory,
  loadComparisonHistory,
  saveComparisonHistory,
  type ComparisonHistorySummary,
} from "./comparisonHistory";
import { fromHex, readOverlaySettings, toHex, writeOverlaySettings } from "./overlaySettings";

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

export interface PdfDiffAppProps {
  engine?: PdfDiffEngine;
  initialComparison?: DiffComparison;
  onMetric?: DiffMetricSink;
}

const lazyBrowserEngine: PdfDiffEngine = {
  async compare(request) {
    const { browserPdfDiffEngine } = await import("../PdfDiffEngine");
    return browserPdfDiffEngine.compare(request);
  },
};

const MAX_FILE_SIZE = 150 * 1024 * 1024;

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

function viewerOverlay(options: DiffOptions) {
  const overlay = { ...readOverlaySettings(), ...options.overlay };
  return { addedColor: toHex(overlay.addedColor), removedColor: toHex(overlay.removedColor), modifiedColor: toHex(overlay.modifiedColor), unchangedOpacity: overlay.unchangedOpacity };
}

function comparisonErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to compare these PDFs.";
}

async function rememberComparison(input: ComparisonInput, refreshHistory: () => Promise<void>): Promise<string> {
  const id = await saveComparisonHistory({ id: input.historyId, ...input });
  await refreshHistory();
  return id;
}

export default function PdfDiffApp({ engine, initialComparison, onMetric }: PdfDiffAppProps) {
  const activeEngine = engine ?? lazyBrowserEngine;
  const [earlierFile, setEarlierFile] = useState<File | null>(null);
  const [newerFile, setNewerFile] = useState<File | null>(null);
  const [comparison, setComparison] = useState<DiffComparison | null>(initialComparison ?? null);
  const [phase, setPhase] = useState<"upload" | "loading" | "workspace">(initialComparison ? "workspace" : "upload");
  const [error, setError] = useState<string | null>(null);
  const [pageProgress, setPageProgress] = useState<{ completed: number; total: number } | null>(null);
  const [activeDrop, setActiveDrop] = useState<"earlier" | "newer" | null>(null);
  const [options, setOptions] = useState<DiffOptions>(() => ({ sensitivity: 28, alignment: "translation", matchPages: true, overlay: readOverlaySettings() }));
  const [history, setHistory] = useState<ComparisonHistorySummary[]>([]);
  const [rememberFiles, setRememberFiles] = useState(false);
  const inputEarlier = useRef<HTMLInputElement>(null);
  const inputNewer = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    acceptFiles(side, selectedFiles);
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

  /**
   * The viewer tints live in hex; the engine bakes page thumbnails from RGB at
   * comparison time. Persisting the viewer's choice keeps the next run's
   * thumbnails in the same colours the reviewer just picked.
   */
  const setOverlay = (style: { addedColor: string; removedColor: string; modifiedColor: string; unchangedOpacity: number }) => {
    const current = { ...readOverlaySettings(), ...options.overlay };
    const overlay = {
      addedColor: fromHex(style.addedColor, current.addedColor),
      removedColor: fromHex(style.removedColor, current.removedColor),
      modifiedColor: fromHex(style.modifiedColor, current.modifiedColor),
      unchangedOpacity: style.unchangedOpacity,
    };
    writeOverlaySettings(overlay);
    setOptions((existing) => ({ ...existing, overlay }));
  };

  /** Page pairing changes what gets compared, so the toggle re-runs the comparison. */
  const setMatchPages = (matchPages: boolean) => {
    const next = { ...options, matchPages };
    setOptions(next);
    if (earlierFile && newerFile) void runComparison({ earlierFile, newerFile, options: next });
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
    setPageProgress(null);
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
          setPageProgress({ completed, total });
        },
        onMetric,
      });
      if (abortController.signal.aborted) return;
      setComparison(result);
      setPhase("workspace");
      setPageProgress(null);
    } catch (comparisonError) {
      if (abortController.signal.aborted) return;
      setError(comparisonErrorMessage(comparisonError));
      setPhase("upload");
    }
  };

  const runSelectedComparison = async () => {
    if (!earlierFile || !newerFile) return;
    const input: ComparisonInput = { earlierFile, newerFile, options };
    if (rememberFiles) {
      try {
        input.historyId = await rememberComparison(input, refreshHistory);
      } catch {
        setError("These PDFs could not be saved in this browser. Free some site storage or compare without remembering them.");
        return;
      }
    }
    void runComparison(input);
  };

  const repeatComparison = async (id: string) => {
    try {
      const saved = await loadComparisonHistory(id);
      setEarlierFile(saved.earlierFile);
      setNewerFile(saved.newerFile);
      setOptions(saved.options);
      void runComparison({
        earlierFile: saved.earlierFile,
        newerFile: saved.newerFile,
        options: saved.options,
        historyId: saved.id,
      });
    } catch {
      setError("The saved PDFs could not be opened. Clear this entry and select the files again.");
      await refreshHistory();
    }
  };

  const clearHistory = async () => {
    if (!window.confirm("Delete all saved PDFs and comparison history from this browser?")) return;
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
    setRememberFiles(false);
    setPhase("upload");
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
    return <UploadScreen earlierFile={earlierFile} newerFile={newerFile} activeDrop={activeDrop} error={error} history={history} rememberFiles={rememberFiles} onRememberFilesChange={setRememberFiles} onChoose={chooseFile} onRemove={(side) => setFile(side, null)} onActive={(side, active) => setActiveDrop(active ? side : null)} onDrop={handleDrop} onInput={handleInput} onSwap={swapFiles} onCompare={() => void runSelectedComparison()} onRepeat={(id) => void repeatComparison(id)} onClearHistory={() => void clearHistory()} inputEarlier={inputEarlier} inputNewer={inputNewer} />;
  }

  if (phase === "loading") {
    return <LoadingScreen onCancel={reset} />;
  }

  if (!comparison) return null;
  return <Suspense fallback={<LoadingScreen onCancel={reset} />}><main {...styleProps(styles.root)}><div {...styleProps(styles.shell)}><PdfDiffViewer comparison={comparison} processingProgress={pageProgress ?? undefined} headerActions={<ThemeToggle />} onNewComparison={reset} defaultOverlay={viewerOverlay(options)} onOverlayChange={setOverlay} matchPages={options.matchPages !== false} onMatchPagesChange={setMatchPages} /></div></main></Suspense>;
}

export { PdfDiffApp };
