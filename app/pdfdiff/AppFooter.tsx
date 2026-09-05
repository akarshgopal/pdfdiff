import { styles, cx } from "./styles";

export function AppFooter() {
  return (
    <footer className={cx(styles.footer)}>
      <div className={cx(styles.footerInner)}>
        <nav className={cx(styles.footerLinks)} aria-label="Footer">
          <a className={cx(styles.footerLink)} href="/terms">
            Terms of service
          </a>
          <a className={cx(styles.footerLink)} href="/privacy">
            Privacy policy
          </a>
          <a className={cx(styles.footerLink)} href="mailto:feedback@pdfdiff.app?subject=PDF%20Diff%20feedback">
            Feedback
          </a>
        </nav>
      </div>
    </footer>
  );
}
