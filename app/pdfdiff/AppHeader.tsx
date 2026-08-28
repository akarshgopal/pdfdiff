import { ThemeToggle } from "../../components/ui/theme-toggle";
import { styles, styleProps } from "./styles";

export function AppHeader({ status, onHelp }: { status: "ready" | "processing"; onHelp?: () => void }) {
  return <header {...styleProps(styles.topbar)}><div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div><div {...styleProps(styles.topbarActions)}><div {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> {status === "ready" ? "Files stay on your device" : "Processing"}</div>{onHelp ? <button {...styleProps(styles.helpButton)} type="button" onClick={onHelp}><span {...styleProps(styles.helpButtonMark)} aria-hidden="true">?</span> How it works</button> : null}<ThemeToggle /></div></header>;
}
