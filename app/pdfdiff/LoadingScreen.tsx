import { styles, styleProps } from "./styles";
import { AppHeader } from "./AppHeader";
import { Button } from "../../components/ui/button";

export function LoadingScreen({ onCancel }: { onCancel: () => void }) {
  return <main {...styleProps(styles.root)}><div {...styleProps(styles.shell)}><AppHeader /><section {...styleProps(styles.loading)} aria-live="polite" aria-busy="true"><div {...styleProps(styles.loadingCard)}><div {...styleProps(styles.loadingPreview)} aria-hidden="true"><div {...styleProps(styles.loadingPage)}><span {...styleProps(styles.loadingLine)} /><span {...styleProps(styles.loadingLine, styles.loadingLineShort)} /><span {...styleProps(styles.loadingBlock)} /></div><div {...styleProps(styles.loadingPage, styles.loadingPageAfter)}><span {...styleProps(styles.loadingLine)} /><span {...styleProps(styles.loadingLine, styles.loadingLineShort)} /><span {...styleProps(styles.loadingChange)} /></div></div><h1 {...styleProps(styles.loadingTitle)}>Opening your PDFs</h1><p {...styleProps(styles.loadingCopy)}>Reading pages and aligning both documents on this device.</p><Button variant="ghost" size="sm" className={styles.loadingCancel} onClick={onCancel}>Cancel</Button></div></section></div></main>;
}
