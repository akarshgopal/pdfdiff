import type { ChangeEvent, DragEvent, RefObject } from "react";
import { Button } from "../../components/ui/button";
import { FileDropzone } from "../../components/ui/file-dropzone";
import { styles, styleProps } from "./styles";
import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import { ProductShowcase } from "./ProductShowcase";
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
  onInput: (side: FileSide, event: ChangeEvent<HTMLInputElement>) => void;
  onSwap: () => void;
  onCompare: () => void;
  onRepeat: (id: string) => void;
  onClearHistory: () => void;
  inputEarlier: RefObject<HTMLInputElement | null>;
  inputNewer: RefObject<HTMLInputElement | null>;
}

export function UploadScreen({ earlierFile, newerFile, activeDrop, error, history, rememberFiles, onRememberFilesChange, onChoose, onRemove, onActive, onDrop, onInput, onSwap, onCompare, onRepeat, onClearHistory, inputEarlier, inputNewer }: UploadScreenProps) {
  return (
    <main {...styleProps(styles.root)}>
      <div {...styleProps(styles.shell)}>
        <AppHeader />
        <section {...styleProps(styles.intro)} aria-labelledby="upload-heading">
          <h1 id="upload-heading" {...styleProps(styles.headline)}>Compare PDFs.<br /><em {...styleProps(styles.headlineAccent)}>See what changed.</em></h1>
          <p {...styleProps(styles.introCopy)}>Choose an earlier and a newer version. pdfdiff aligns the pages and highlights changes in text and graphics.</p>
          <div {...styleProps(styles.uploadGrid)}><FileDropzone label="Earlier" file={earlierFile} active={activeDrop === "earlier"} onChoose={() => onChoose("earlier")} onRemove={() => onRemove("earlier")} onActive={(active) => onActive("earlier", active)} onDrop={(event) => onDrop("earlier", event)} /><button {...styleProps(styles.swapUpload)} type="button" aria-label="Swap earlier and newer files" onClick={onSwap}>↔</button><FileDropzone label="Newer" file={newerFile} active={activeDrop === "newer"} onChoose={() => onChoose("newer")} onRemove={() => onRemove("newer")} onActive={(active) => onActive("newer", active)} onDrop={(event) => onDrop("newer", event)} /></div>
          <input ref={inputEarlier} {...styleProps(styles.srOnly)} type="file" multiple accept="application/pdf,.pdf" aria-label="Choose one or two PDFs for earlier and newer" onChange={(event) => onInput("earlier", event)} />
          <input ref={inputNewer} {...styleProps(styles.srOnly)} type="file" multiple accept="application/pdf,.pdf" aria-label="Choose one or two PDFs for newer and earlier" onChange={(event) => onInput("newer", event)} />
          <label {...styleProps(styles.rememberOption)}><input {...styleProps(styles.rememberCheckbox)} type="checkbox" checked={rememberFiles} onChange={(event) => onRememberFilesChange(event.target.checked)} /><span><strong {...styleProps(styles.rememberTitle)}>Remember these PDFs on this device</strong><span {...styleProps(styles.rememberCopy)}>Stores a local copy in this browser so you can reopen the comparison. Nothing is uploaded.</span></span></label>
          <Button size="lg" className={styles.compareButton} disabled={!earlierFile || !newerFile} onClick={onCompare}>Compare <span aria-hidden="true">→</span></Button>
          <p {...styleProps(styles.privacyNote)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" />Private by design. Files are compared in this browser and never uploaded.</p>
          {error ? <div {...styleProps(styles.errorBox)} role="alert">{error}</div> : null}
          {history.length > 0 ? <ComparisonHistory history={history} onRepeat={onRepeat} onClear={onClearHistory} /> : null}
          <ProductShowcase />
        </section>
        <AppFooter />
      </div>
    </main>
  );
}

function ComparisonHistory({ history, onRepeat, onClear }: { history: ComparisonHistorySummary[]; onRepeat: (id: string) => void; onClear: () => void }) {
  return <section {...styleProps(styles.history)} aria-labelledby="history-heading"><div {...styleProps(styles.historyHeader)}><h2 id="history-heading" {...styleProps(styles.historyTitle)}>Saved comparisons</h2><Button variant="ghost" size="sm" onClick={onClear}>Clear history</Button></div><div {...styleProps(styles.historyList)}>{history.map((item) => <article key={item.id} {...styleProps(styles.historyCard)}><div {...styleProps(styles.historyFiles)}><strong {...styleProps(styles.historyFileName)} title={item.earlierName}>{item.earlierName}</strong><span {...styleProps(styles.historyArrow)} aria-hidden="true">→</span><strong {...styleProps(styles.historyFileName)} title={item.newerName}>{item.newerName}</strong></div><div {...styleProps(styles.historyMeta)}><span>{formatFileSize(item.earlierSize + item.newerSize)}</span><span>Saved {new Date(item.updatedAt).toLocaleDateString()}</span></div><Button variant="outline" size="sm" className={styles.historyResume} onClick={() => onRepeat(item.id)}>Open <span aria-hidden="true">→</span></Button></article>)}</div><p {...styleProps(styles.historyNote)}>PDFs and settings are stored only in this browser. Clear history to delete every saved copy.</p></section>;
}
