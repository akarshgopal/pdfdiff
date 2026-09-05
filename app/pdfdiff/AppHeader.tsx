import { ThemeToggle } from "../../components/ui/theme-toggle";
import { styles, styleProps } from "./styles";

/** One header for every screen; pass a href to make the wordmark a home link. */
export function AppHeader({ href }: { href?: string } = {}) {
  const mark = (
    <>
      <span {...styleProps(styles.logoMark)} aria-hidden="true">
        ◐
      </span>{" "}
      pdfdiff
    </>
  );
  return (
    <header {...styleProps(styles.topbar)}>
      {href ? (
        <a {...styleProps(styles.logo)} href={href} aria-label="pdfdiff home">
          {mark}
        </a>
      ) : (
        <div {...styleProps(styles.logo)}>{mark}</div>
      )}
      <ThemeToggle />
    </header>
  );
}
