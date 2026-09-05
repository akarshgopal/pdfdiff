import { ThemeToggle } from "../../components/ui/theme-toggle";
import { styles, cx } from "./styles";

/** One header for every screen; pass a href to make the wordmark a home link. */
export function AppHeader({ href }: { href?: string } = {}) {
  const mark = (
    <>
      <span className={cx(styles.logoMark)} aria-hidden="true">
        ◐
      </span>{" "}
      pdfdiff
    </>
  );
  return (
    <header className={cx(styles.topbar)}>
      {href ? (
        <a className={cx(styles.logo)} href={href} aria-label="pdfdiff home">
          {mark}
        </a>
      ) : (
        <div className={cx(styles.logo)}>{mark}</div>
      )}
      <ThemeToggle />
    </header>
  );
}
