import { styles, styleProps } from "./styles";
import { AppHeader } from "./AppHeader";
import { Button } from "../../components/ui/button";

export function LoadingScreen({ progress, onCancel }: { progress: number; onCancel: () => void }) {
  return <main {...styleProps(styles.root)}><div {...styleProps(styles.shell)}><AppHeader /><section {...styleProps(styles.loading)} aria-live="polite" aria-busy="true"><div {...styleProps(styles.loadingCard)}><div {...styleProps(styles.loadingMark)} aria-hidden="true">◐</div><h1 {...styleProps(styles.loadingTitle)}>Comparing your PDFs</h1><p {...styleProps(styles.loadingCopy)}>Rendering pages and finding changes.</p><div {...styleProps(styles.progressTrack)} role="progressbar" aria-label="Comparison progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div {...styleProps(styles.progressFill)} style={{ width: `${progress}%` }} /></div><p {...styleProps(styles.progressLabel)}>{progress ? `${progress}% complete` : "Preparing pages…"}</p><Button variant="ghost" size="sm" className={styles.loadingCancel} onClick={onCancel}>Cancel</Button></div></section></div></main>;
}
