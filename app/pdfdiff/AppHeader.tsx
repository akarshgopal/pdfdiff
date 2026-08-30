import { ThemeToggle } from "../../components/ui/theme-toggle";
import { styles, styleProps } from "./styles";

export function AppHeader() {
  return <header {...styleProps(styles.topbar)}><div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div><ThemeToggle /></header>;
}
