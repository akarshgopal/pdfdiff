import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "./button";

const THEME_STORAGE_KEY = "pdfdiff-theme";

type Theme = "light" | "dark";

function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this session when storage is unavailable.
  }
}

function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Lets components pick theme-specific assets that CSS alone cannot swap. */
export function useThemeMode(): Theme {
  return useSyncExternalStore(subscribeToTheme, getTheme, () => "light");
}

export function ThemeToggle() {
  const toggleTheme = () => {
    applyTheme(getTheme() === "dark" ? "light" : "dark");
  };

  return (
    <Button
      variant="outline"
      size="icon"
      className="size-8 rounded-md border-border bg-card text-muted-foreground hover:border-foreground/30 hover:bg-background hover:text-foreground"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      onClick={toggleTheme}
    >
      <Sun className="size-4 dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-4 dark:block" aria-hidden="true" />
      <span className="sr-only">Toggle dark mode</span>
    </Button>
  );
}
