import type { ChangeEvent, DragEvent, RefObject } from "react";
import { Button } from "../../components/ui/button";
import { FileDropzone } from "../../components/ui/file-dropzone";
import { helpSteps } from "@pdfdiff/viewer-react";
import { styles, styleProps } from "./styles";
import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import type { ComparisonHistorySummary } from "./comparisonHistory";
import { formatFileSize } from "../../lib/format";

type FileSide = "earlier" | "newer";

export interface UploadScreenProps {
  earlierFile: File | null;
  newerFile: File | null;
  activeDrop: FileSide | null;
  error: string | null;
  history: ComparisonHistorySummary[];
  onChoose: (side: FileSide) => void;
  onRemove: (side: FileSide) => void;
  onActive: (side: FileSide, active: boolean) => void;
  onDrop: (side: FileSide, event: DragEvent<HTMLDivElement>) => void;
  onInput: (side: FileSide, event: ChangeEvent<HTMLInputElement>) => void;
  onSwap: () => void;
  onCompare: () => void;
  onResume: (id: string) => void;
  onClearHistory: () => void;
  onHelp: () => void;
  inputEarlier: RefObject<HTMLInputElement | null>;
  inputNewer: RefObject<HTMLInputElement | null>;
}

export function UploadScreen({ earlierFile, newerFile, activeDrop, error, history, onChoose, onRemove, onActive, onDrop, onInput, onSwap, onCompare, onResume, onClearHistory, onHelp, inputEarlier, inputNewer }: UploadScreenProps) {
  return (
    <main {...styleProps(styles.root)}>
      <div {...styleProps(styles.shell)}>
        <AppHeader status="ready" onHelp={onHelp} />
        <section {...styleProps(styles.intro)} aria-labelledby="upload-heading">
          <p {...styleProps(styles.eyebrow)}>PDF comparison</p>
          <h1 id="upload-heading" {...styleProps(styles.headline)}>Compare PDFs.<br /><em {...styleProps(styles.headlineAccent)}>Spot the difference.</em></h1>
          <p {...styleProps(styles.introCopy)}>Drop two versions to review what changed, page by page. Or select both PDFs from either picker; the first fills the card you opened.</p>
          <div {...styleProps(styles.uploadGrid)}><FileDropzone label="Earlier" description="Original PDF" file={earlierFile} active={activeDrop === "earlier"} onChoose={() => onChoose("earlier")} onRemove={() => onRemove("earlier")} onActive={(active) => onActive("earlier", active)} onDrop={(event) => onDrop("earlier", event)} /><button {...styleProps(styles.swapUpload)} type="button" aria-label="Swap earlier and newer files" onClick={onSwap}>↔</button><FileDropzone label="Newer" description="Revised PDF" file={newerFile} active={activeDrop === "newer"} onChoose={() => onChoose("newer")} onRemove={() => onRemove("newer")} onActive={(active) => onActive("newer", active)} onDrop={(event) => onDrop("newer", event)} /></div>
          <input ref={inputEarlier} {...styleProps(styles.srOnly)} type="file" multiple accept="application/pdf,.pdf" aria-label="Choose one or two PDFs for earlier and newer" onChange={(event) => onInput("earlier", event)} />
          <input ref={inputNewer} {...styleProps(styles.srOnly)} type="file" multiple accept="application/pdf,.pdf" aria-label="Choose one or two PDFs for newer and earlier" onChange={(event) => onInput("newer", event)} />
          <Button size="lg" className={styles.compareButton} disabled={!earlierFile || !newerFile} onClick={onCompare}>Compare PDFs <span aria-hidden="true">→</span></Button>
          {error ? <div {...styleProps(styles.errorBox)} role="alert">{error}</div> : null}
          {history.length > 0 ? <ComparisonHistory history={history} onResume={onResume} onClear={onClearHistory} /> : null}
          <HowToSection />
        </section>
        <AppFooter />
      </div>
    </main>
  );
}

function ComparisonHistory({ history, onResume, onClear }: { history: ComparisonHistorySummary[]; onResume: (id: string) => void; onClear: () => void }) {
  return <section {...styleProps(styles.history)} aria-labelledby="history-heading"><div {...styleProps(styles.historyHeader)}><div><p {...styleProps(styles.eyebrow)}>On this device</p><h2 id="history-heading" {...styleProps(styles.historyTitle)}>Recent comparisons</h2></div><Button variant="ghost" size="sm" onClick={onClear}>Clear history</Button></div><div {...styleProps(styles.historyList)}>{history.map((item) => <article key={item.id} {...styleProps(styles.historyCard)}><div {...styleProps(styles.historyFiles)}><strong {...styleProps(styles.historyFileName)} title={item.earlierName}>{item.earlierName}</strong><span {...styleProps(styles.historyArrow)} aria-hidden="true">→</span><strong {...styleProps(styles.historyFileName)} title={item.newerName}>{item.newerName}</strong></div><div {...styleProps(styles.historyMeta)}><span>{formatFileSize(item.earlierSize + item.newerSize)} stored locally</span><span>Last opened {new Date(item.updatedAt).toLocaleDateString()}</span></div><Button variant="outline" size="sm" className={styles.historyResume} onClick={() => onResume(item.id)}>Resume <span aria-hidden="true">→</span></Button></article>)}</div><p {...styleProps(styles.historyNote)}>The PDFs are stored only in this browser. Resuming reruns the comparison with its saved settings.</p></section>;
}

function HowToSection() {
  return <section {...styleProps(styles.howTo)} aria-labelledby="how-to-heading"><div {...styleProps(styles.howToHeader)}><p {...styleProps(styles.eyebrow)}>How it works</p><h2 id="how-to-heading" {...styleProps(styles.howToTitle)}>A clear path from revision to review.</h2><p {...styleProps(styles.howToCopy)}>PDF Diff turns two versions into a focused review workspace. Everything happens locally, so you can move from upload to evidence without sending the documents anywhere.</p></div><div {...styleProps(styles.howToGrid)}>{helpSteps.map((step) => <article key={step.number} {...styleProps(styles.howToCard)}><span {...styleProps(styles.howToStep)}>{step.number}</span><h3 {...styleProps(styles.howToCardTitle)}>{step.title}</h3><p {...styleProps(styles.howToCardCopy)}>{step.copy}</p></article>)}</div><div {...styleProps(styles.featureGrid)}><div {...styleProps(styles.featureCard)}><strong {...styleProps(styles.featureTitle)}>Local by design</strong><p {...styleProps(styles.featureCopy)}>PDFs stay on this device while they are processed.</p></div><div {...styleProps(styles.featureCard)}><strong {...styleProps(styles.featureTitle)}>Seven ways to compare</strong><p {...styleProps(styles.featureCopy)}>Diff, semantic text, side by side, swipe, blink, Earlier, and Newer.</p></div><div {...styleProps(styles.featureCard)}><strong {...styleProps(styles.featureTitle)}>Review-ready detail</strong><p {...styleProps(styles.featureCopy)}>Page status, change regions, text changes, and full-page views.</p></div></div></section>;
}
