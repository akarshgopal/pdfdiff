import { useEffect, useState } from "react";
import type { ChangeEvent, DragEvent, RefObject } from "react";
import { Button } from "../../components/ui/button";
import { FileDropzone } from "../../components/ui/file-dropzone";
import { styles, styleProps } from "./styles";
import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import { HeroDemo } from "./HeroDemo";
import type { ComparisonHistorySummary } from "./comparisonHistory";
import { formatFileSize } from "../../lib/format";

type FileSide = "earlier" | "newer";

export interface UploadScreenProps {
  earlierFile: File | null;
  newerFile: File | null;
  activeDrop: FileSide | null;
  error: string | null;
  history: ComparisonHistorySummary[];
  rememberFiles: boolean;
  onRememberFilesChange: (remember: boolean) => void;
  onChoose: (side: FileSide) => void;
  onRemove: (side: FileSide) => void;
  onActive: (side: FileSide, active: boolean) => void;
  onDrop: (side: FileSide, event: DragEvent<HTMLDivElement>) => void;
  onDropAnywhere: (files: File[]) => void;
  onInput: (side: FileSide, event: ChangeEvent<HTMLInputElement>) => void;
  onSwap: () => void;
  onCompare: () => void;
  onRepeat: (id: string) => void;
  onClearHistory: () => void;
  inputEarlier: RefObject<HTMLInputElement | null>;
  inputNewer: RefObject<HTMLInputElement | null>;
}

/** Both PDFs chosen and nothing focused: Enter is the obvious next keystroke. */
function useEnterToCompare(ready: boolean, onCompare: () => void) {
  useEffect(() => {
    if (!ready) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select, [contenteditable]")) return;
      onCompare();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ready, onCompare]);
}

export function UploadScreen({ earlierFile, newerFile, activeDrop, error, history, rememberFiles, onRememberFilesChange, onChoose, onRemove, onActive, onDrop, onDropAnywhere, onInput, onSwap, onCompare, onRepeat, onClearHistory, inputEarlier, inputNewer }: UploadScreenProps) {
  const ready = Boolean(earlierFile && newerFile);
  const [pageDrag, setPageDrag] = useState(false);
  useEnterToCompare(ready, onCompare);
  return (
    <main
      {...styleProps(styles.root, pageDrag && styles.pageDropActive)}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) setPageDrag(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPageDrag(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setPageDrag(false);
        onDropAnywhere(Array.from(event.dataTransfer.files ?? []));
      }}
    >
      <div {...styleProps(styles.shell)}>
        <AppHeader />
        <section {...styleProps(styles.intro)} aria-labelledby="upload-heading">
          <div {...styleProps(styles.introMain)}>
            <h1 id="upload-heading" {...styleProps(styles.headline, ready && styles.headlineCompact)}>Compare PDFs.<br /><em {...styleProps(styles.headlineAccent)}>See what changed.</em></h1>
            <div {...styleProps(styles.uploadGrid)}><FileDropzone label="Earlier" file={earlierFile} active={activeDrop === "earlier"} onChoose={() => onChoose("earlier")} onRemove={() => onRemove("earlier")} onActive={(active) => onActive("earlier", active)} onDrop={(event) => onDrop("earlier", event)} /><button {...styleProps(styles.swapUpload)} type="button" aria-label="Swap earlier and newer files" onClick={onSwap}>↔</button><FileDropzone label="Newer" accent file={newerFile} active={activeDrop === "newer"} onChoose={() => onChoose("newer")} onRemove={() => onRemove("newer")} onActive={(active) => onActive("newer", active)} onDrop={(event) => onDrop("newer", event)} /></div>
            <input ref={inputEarlier} {...styleProps('sr-only')} type="file" multiple accept="application/pdf,.pdf" aria-label="Choose one or two PDFs for earlier and newer" onChange={(event) => onInput("earlier", event)} />
            <input ref={inputNewer} {...styleProps('sr-only')} type="file" multiple accept="application/pdf,.pdf" aria-label="Choose one or two PDFs for newer and earlier" onChange={(event) => onInput("newer", event)} />
            <div {...styleProps(styles.introActions)}>
              <Button size="lg" className={styleProps(styles.compareButton, ready && styles.compareButtonReady).className} disabled={!ready} onClick={onCompare}>Compare <span aria-hidden="true">→</span></Button>
              <p {...styleProps(styles.privacyNote)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" />Files are compared in this browser and never uploaded.</p>
              <label {...styleProps(styles.rememberOption)}><input {...styleProps(styles.rememberCheckbox)} type="checkbox" checked={rememberFiles} onChange={(event) => onRememberFilesChange(event.target.checked)} />Remember these PDFs in this browser so you can reopen the comparison</label>
            </div>
            {error ? <div {...styleProps(styles.errorBox)} role="alert">{error}</div> : null}
          </div>
          <HeroDemo />
        </section>
        {history.length > 0 ? <ComparisonHistory history={history} onRepeat={onRepeat} onClear={onClearHistory} /> : null}
        <Facts />
        <AppFooter />
      </div>
    </main>
  );
}

function Facts() {
  return (
    <section {...styleProps(styles.facts)} aria-label="What pdfdiff does">
      <p><strong {...styleProps(styles.factTitle)}>What it catches</strong>Text edits, moved content, images and vector artwork, and pages added or removed — matched up even when a change shifts everything after it.</p>
      <p><strong {...styleProps(styles.factTitle)}>Any PDF up to 150 MB</strong>Drawings, scans, and exports from any tool. Drop both files anywhere on this page, or drop two at once to fill both slots.</p>
      <p><strong {...styleProps(styles.factTitle)}>Nothing leaves this device</strong>The comparison runs in your browser. Saved comparisons stay in this browser&rsquo;s storage and clearing history deletes them.</p>
    </section>
  );
}

function ComparisonHistory({ history, onRepeat, onClear }: { history: ComparisonHistorySummary[]; onRepeat: (id: string) => void; onClear: () => void }) {
  return <section {...styleProps(styles.history)} aria-labelledby="history-heading"><div {...styleProps(styles.historyHeader)}><h2 id="history-heading" {...styleProps(styles.historyTitle)}>Saved comparisons</h2><Button variant="ghost" size="sm" onClick={onClear}>Clear history</Button></div><div {...styleProps(styles.historyList)}>{history.map((item) => <article key={item.id} {...styleProps(styles.historyCard)}><div {...styleProps(styles.historyFiles)}><strong {...styleProps(styles.historyFileName)} title={item.earlierName}>{item.earlierName}</strong><span {...styleProps(styles.historyArrow)} aria-hidden="true">→</span><strong {...styleProps(styles.historyFileName)} title={item.newerName}>{item.newerName}</strong></div><div {...styleProps(styles.historyMeta)}><span>{formatFileSize(item.earlierSize + item.newerSize)}</span><span>Saved {new Date(item.updatedAt).toLocaleDateString()}</span></div><Button variant="outline" size="sm" className={styles.historyResume} onClick={() => onRepeat(item.id)}>Open <span aria-hidden="true">→</span></Button></article>)}</div><p {...styleProps(styles.historyNote)}>Clearing history deletes every saved copy.</p></section>;
}
