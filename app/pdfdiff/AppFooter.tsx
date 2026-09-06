import { styles } from "./styles";

export function AppFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={styles.footerCredit}>A personal project by Akarsh Gopal</p>
        <nav className={styles.footerLinks} aria-label="Footer">
          <a className={styles.footerLink} href="/terms">
            Terms of service
          </a>
          <a className={styles.footerLink} href="/privacy">
            Privacy policy
          </a>
          <a className={styles.footerLink} href="mailto:feedback@pdfdiff.app?subject=PDF%20Diff%20feedback">
            Feedback
          </a>
        </nav>
      </div>
    </footer>
  );
}
