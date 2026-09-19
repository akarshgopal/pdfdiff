import { styles } from "./styles";

export function AppFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <nav className={styles.footerLinks} aria-label="Footer">
          <a className={styles.footerLink} href="/terms">
            Terms of service
          </a>
          <a className={styles.footerLink} href="/privacy">
            Privacy policy
          </a>
          <a
            className={styles.footerLink}
            href="https://www.npmjs.com/package/@pdfdiff/cli"
            target="_blank"
            rel="noopener noreferrer"
          >
            CLI on npm
          </a>
          <a className={styles.footerLink} href="mailto:akarsh@pdfdiff.app?subject=PDF%20Diff%20contact">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
