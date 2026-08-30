import { styles, styleProps } from "./styles";

export function AppFooter() {
  return (
    <footer {...styleProps(styles.footer)}>
      <div {...styleProps(styles.footerInner)}>
        <p {...styleProps(styles.footerNote)}>PDF Diff · Private document review in your browser.</p>
        <nav {...styleProps(styles.footerLinks)} aria-label="Footer">
          <a {...styleProps(styles.footerLink)} href="/terms">Terms of service</a>
          <a {...styleProps(styles.footerLink)} href="/privacy">Privacy policy</a>
          <a {...styleProps(styles.footerLink)} href="mailto:feedback@pdfdiff.app?subject=PDF%20Diff%20feedback">Feedback</a>
        </nav>
      </div>
    </footer>
  );
}
