import { useState } from "react";
import type { ChangeEvent, DragEvent, RefObject } from "react";
import { Button } from "../../components/ui/button";
import { FileDropzone } from "../../components/ui/file-dropzone";
import { styles, cx } from "./styles";
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

export function UploadScreen({
  earlierFile,
  newerFile,
  activeDrop,
  error,
  history,
  rememberFiles,
  onRememberFilesChange,
  onChoose,
  onRemove,
  onActive,
  onDrop,
  onDropAnywhere,
  onInput,
  onSwap,
  onCompare,
  onRepeat,
  onClearHistory,
  inputEarlier,
  inputNewer,
}: UploadScreenProps) {
  const ready = Boolean(earlierFile && newerFile);
  const [pageDrag, setPageDrag] = useState(false);
  return (
    <main
      className={cx(styles.root, pageDrag && styles.pageDropActive)}
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
      <div className={styles.shell}>
        <AppHeader />
        <section className={styles.intro} aria-labelledby="upload-heading">
          <div className={styles.introMain}>
            <h1 id="upload-heading" className={cx(styles.headline, ready && "text-[clamp(24px,2.6vw,30px)]")}>
              Compare PDFs.
              <br />
              <em className={styles.headlineAccent}>See what changed.</em>
            </h1>
            <div className={styles.uploadGrid}>
              <FileDropzone
                label="Earlier"
                file={earlierFile}
                active={activeDrop === "earlier"}
                onChoose={() => onChoose("earlier")}
                onRemove={() => onRemove("earlier")}
                onActive={(active) => onActive("earlier", active)}
                onDrop={(event) => onDrop("earlier", event)}
              />
              <button
                className={styles.swapUpload}
                type="button"
                aria-label="Swap earlier and newer files"
                onClick={onSwap}
              >
                ↔
              </button>
              <FileDropzone
                label="Newer"
                accent
                file={newerFile}
                active={activeDrop === "newer"}
                onChoose={() => onChoose("newer")}
                onRemove={() => onRemove("newer")}
                onActive={(active) => onActive("newer", active)}
                onDrop={(event) => onDrop("newer", event)}
              />
            </div>
            <input
              ref={inputEarlier}
              className="sr-only"
              type="file"
              multiple
              accept="application/pdf,.pdf"
              aria-label="Choose one or two PDFs for earlier and newer"
              onChange={(event) => onInput("earlier", event)}
            />
            <input
              ref={inputNewer}
              className="sr-only"
              type="file"
              multiple
              accept="application/pdf,.pdf"
              aria-label="Choose one or two PDFs for newer and earlier"
              onChange={(event) => onInput("newer", event)}
            />
            <div className={styles.introActions}>
              <Button
                size="lg"
                className={cx(styles.compareButton, ready && "w-full")}
                disabled={!ready}
                onClick={onCompare}
              >
                Compare <span aria-hidden="true">→</span>
              </Button>
              <p className={styles.privacyNote}>
                <span className={styles.privacyDot} aria-hidden="true" />
                Files are compared in this browser and never uploaded.
              </p>
              <label className={styles.rememberOption}>
                <input
                  className={styles.rememberCheckbox}
                  type="checkbox"
                  checked={rememberFiles}
                  onChange={(event) => onRememberFilesChange(event.target.checked)}
                />
                Remember these PDFs in this browser so you can reopen the comparison
              </label>
            </div>
            {error ? (
              <div className={styles.errorBox} role="alert">
                {error}
              </div>
            ) : null}
          </div>
          <HeroDemo />
        </section>
        {history.length > 0 ? (
          <ComparisonHistory history={history} onRepeat={onRepeat} onClear={onClearHistory} />
        ) : null}
        <AppFooter />
      </div>
    </main>
  );
}

function ComparisonHistory({
  history,
  onRepeat,
  onClear,
}: {
  history: ComparisonHistorySummary[];
  onRepeat: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <section className={styles.history} aria-labelledby="history-heading">
      <div className={styles.historyHeader}>
        <h2 id="history-heading" className={styles.historyTitle}>
          Saved comparisons
        </h2>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear history
        </Button>
      </div>
      <div className={styles.historyList}>
        {history.map((item) => (
          <article key={item.id} className={styles.historyCard}>
            <div className={styles.historyFiles}>
              <strong className={styles.historyFileName} title={item.earlierName}>
                {item.earlierName}
              </strong>
              <span className={styles.historyArrow} aria-hidden="true">
                →
              </span>
              <strong className={styles.historyFileName} title={item.newerName}>
                {item.newerName}
              </strong>
            </div>
            <div className={styles.historyMeta}>
              <span>{formatFileSize(item.earlierSize + item.newerSize)}</span>
              <span>Saved {new Date(item.updatedAt).toLocaleDateString()}</span>
            </div>
            <Button variant="outline" size="sm" className={styles.historyResume} onClick={() => onRepeat(item.id)}>
              Open <span aria-hidden="true">→</span>
            </Button>
          </article>
        ))}
      </div>
      <p className={styles.historyNote}>Clearing history deletes every saved copy.</p>
    </section>
  );
}
