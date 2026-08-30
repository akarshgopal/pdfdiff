import { styles, styleProps } from "./styles";
import { AppHeader } from "./AppHeader";

export function LoadingScreen({ progress }: { progress: number }) {
  return <main {...styleProps(styles.root)}><div {...styleProps(styles.shell)}><AppHeader /><section {...styleProps(styles.loading)} aria-live="polite" aria-busy="true"><div {...styleProps(styles.loadingCard)}><div {...styleProps(styles.loadingMark)} aria-hidden="true">◐</div><h1 {...styleProps(styles.loadingTitle)}>Comparing your PDFs</h1><p {...styleProps(styles.loadingCopy)}>Rendering pages and finding changes.</p><div {...styleProps(styles.progressTrack)}><div {...styleProps(styles.progressFill)} style={{ width: `${progress}%` }} /></div><p {...styleProps(styles.progressLabel)}>{progress ? `${progress}% complete` : "Preparing pages…"}</p></div></section></div></main>;
}
