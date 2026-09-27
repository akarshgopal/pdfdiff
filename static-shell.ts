import "./app/globals.css";

const THEME_STORAGE_KEY = "pdfdiff-theme";

type Theme = "light" | "dark";

/** Same key and `.dark` class as the React toggle, for pages that do not mount it. */
function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this session when storage is unavailable.
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
  button.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  });
}

/** Same order, captions, and 4.2s cycle as the React HeroDemo. `/` starts on swipe so the CSS clip runs on load. */
const HERO_MODES = ["overlay", "split", "swipe", "text"] as const;
type HeroMode = (typeof HERO_MODES)[number];

const HERO_CAPTION: Record<HeroMode, string> = {
  overlay: "Removed content in red, added in teal, modified in purple.",
  split: "Matched pages side by side, changed regions boxed.",
  swipe: "Drag the divider to reveal one revision under the other.",
  text: "Added and removed wording highlighted in place.",
};

const HERO_COUNT: Record<HeroMode, string> = {
  overlay: "3 areas on this page",
  split: "3 areas on this page",
  swipe: "3 areas on this page",
  text: "2 text changes on this page",
};

const HERO_TAB_IDLE = ["border-transparent", "bg-transparent", "text-muted-foreground"] as const;
const HERO_TAB_CURRENT = ["border-border", "bg-background", "text-foreground"] as const;

function isHeroMode(value: string): value is HeroMode {
  return (HERO_MODES as readonly string[]).includes(value);
}

function mountHeroDemo(root: HTMLElement): void {
  const count = root.querySelector<HTMLElement>("[data-hero-count]");
  const caption = root.querySelector<HTMLElement>("[data-hero-caption]");
  const panels = [...root.querySelectorAll<HTMLElement | SVGElement>("[data-hero-panel]")];
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-hero-mode]")];
  let mode: HeroMode = "swipe";
  let timer: ReturnType<typeof setInterval> | undefined;

  const apply = (next: HeroMode): void => {
    mode = next;
    if (count) count.textContent = HERO_COUNT[next];
    if (caption) caption.textContent = HERO_CAPTION[next];
    for (const panel of panels) panel.toggleAttribute("hidden", panel.dataset.heroPanel !== next);
    for (const tab of tabs) {
      const active = tab.dataset.heroMode === next;
      tab.setAttribute("aria-pressed", active ? "true" : "false");
      tab.classList.remove(...HERO_TAB_IDLE, ...HERO_TAB_CURRENT);
      tab.classList.add(...(active ? HERO_TAB_CURRENT : HERO_TAB_IDLE));
    }
  };

  const stop = (): void => {
    if (timer === undefined) return;
    clearInterval(timer);
    timer = undefined;
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const next = tab.dataset.heroMode ?? "";
      if (!isHeroMode(next)) return;
      stop();
      apply(next);
    });
  }

  apply(mode);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  timer = setInterval(() => {
    const next = HERO_MODES[(HERO_MODES.indexOf(mode) + 1) % HERO_MODES.length];
    if (next) apply(next);
  }, 4200);
}

const heroDemo = document.querySelector<HTMLElement>("[data-hero-demo]");
if (heroDemo) mountHeroDemo(heroDemo);
