import { styles, cx } from "./styles";
import { AppHeader } from "./AppHeader";
import { Button } from "../../components/ui/button";

export function LoadingScreen({ onCancel }: { onCancel: () => void }) {
  return (
    <main className={styles.root}>
      <div className={styles.shell}>
        <AppHeader />
        <section className={styles.loading} aria-live="polite" aria-busy="true">
          <div className={styles.loadingCard}>
            <div className={styles.loadingPreview} aria-hidden="true">
              <div className={styles.loadingPage}>
                <span className={styles.loadingLine} />
                <span className={cx(styles.loadingLine, styles.loadingLineShort)} />
                <span className={styles.loadingBlock} />
              </div>
              <div className={cx(styles.loadingPage, styles.loadingPageAfter)}>
                <span className={styles.loadingLine} />
                <span className={cx(styles.loadingLine, styles.loadingLineShort)} />
                <span className={styles.loadingChange} />
              </div>
            </div>
            <h1 className={styles.loadingTitle}>Opening your PDFs</h1>
            <p className={styles.loadingCopy}>Reading pages and aligning both documents on this device.</p>
            <Button variant="ghost" size="sm" className={styles.loadingCancel} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
