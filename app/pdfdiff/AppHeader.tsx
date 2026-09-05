import { ThemeToggle } from "../../components/ui/theme-toggle";
import { styles } from "./styles";

/** One header for every screen; pass a href to make the wordmark a home link. */
export function AppHeader({ href }: { href?: string } = {}) {
  const mark = (
    <>
      <span className={styles.logoMark} aria-hidden="true">
        ◐
      </span>{" "}
      pdfdiff
    </>
  );
  return (
    <header className={styles.topbar}>
      {href ? (
        <a className={styles.logo} href={href} aria-label="pdfdiff home">
          {mark}
        </a>
      ) : (
        <div className={styles.logo}>{mark}</div>
      )}
      <ThemeToggle />
    </header>
  );
}
