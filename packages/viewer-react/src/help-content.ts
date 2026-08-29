export const helpSteps = [
  { number: "1", title: "Pick a page", copy: "Use the Pages rail for aligned pages, or its A/B controls to step either PDF independently in any view mode." },
  { number: "2", title: "Choose a view", copy: "Use Diff, Semantic text, Side by side, Swipe, Blink, Earlier, or Newer." },
  { number: "3", title: "Inspect changes", copy: "Select a region or text change, toggle highlights, and move to the next changed page." },
] as const;

export const helpModes = [
  ["Semantic text", "native PDF pages with anchored text highlights."],
  ["Diff", "visual change overlay for the selected A/B page pair."],
  ["Side by side", "compare both pages together."],
  ["Swipe / Blink", "reveal or alternate between the independently selected pages."],
  ["Earlier / Newer", "inspect one source page on its own."],
] as const;

export const helpShortcuts = [
  ["← →", "Comparison pages"],
  ["1–7", "View modes"],
  ["J / N", "Next page; K / P goes back"],
  ["M", "Cycle modes"],
  ["Shift + ← →", "Earlier source pages"],
  ["Ctrl/Cmd + ← →", "Newer source pages"],
  ["Esc", "Close or clear selection"],
] as const;
