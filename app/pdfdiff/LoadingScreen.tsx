import { styles, cx } from "./styles";
import { AppHeader } from "./AppHeader";
import { Button } from "../../components/ui/button";

export function LoadingScreen({ onCancel }: { onCancel: () => void }) {
  return (
    <main className={cx(styles.root)}>
      <div className={cx(styles.shell)}>
        <AppHeader />
        <section className={cx(styles.loading)} aria-live="polite" aria-busy="true">
          <div className={cx(styles.loadingCard)}>
            <div className={cx(styles.loadingPreview)} aria-hidden="true">
              <div className={cx(styles.loadingPage)}>
                <span className={cx(styles.loadingLine)} />
                <span className={cx(styles.loadingLine, styles.loadingLineShort)} />
                <span className={cx(styles.loadingBlock)} />
              </div>
              <div className={cx(styles.loadingPage, styles.loadingPageAfter)}>
                <span className={cx(styles.loadingLine)} />
                <span className={cx(styles.loadingLine, styles.loadingLineShort)} />
                <span className={cx(styles.loadingChange)} />
              </div>
            </div>
            <h1 className={cx(styles.loadingTitle)}>Opening your PDFs</h1>
            <p className={cx(styles.loadingCopy)}>Reading pages and aligning both documents on this device.</p>
            <Button variant="ghost" size="sm" className={styles.loadingCancel} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
