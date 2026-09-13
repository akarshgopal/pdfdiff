import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";
import { styles } from "./styles";

export function NotFoundPage() {
  return (
    <main className={styles.root}>
      <div className={styles.shell}>
        <AppHeader href="/" />
        <article className={styles.legalArticle}>
          <a className={styles.legalBack} href="/">
            ← Back to pdfdiff
          </a>
          <header className={styles.legalHeader}>
            <p className={styles.eyebrow}>Not found</p>
            <h1 className={styles.legalTitle}>This page does not exist</h1>
            <p className={styles.legalUpdated}>The URL is not a page on pdfdiff.</p>
          </header>
          <p className={styles.legalLead}>
            <a className={styles.legalLink} href="/">
              Return home
            </a>{" "}
            to compare two PDFs in your browser. Files never leave your device.
          </p>
        </article>
        <AppFooter />
      </div>
    </main>
  );
}
