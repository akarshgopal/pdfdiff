export const helpSteps = [
  { number: "1", title: "Select pages", copy: "Use the stacked A and B controls for independent page navigation, or choose an overlay thumbnail to align both sources." },
  { number: "2", title: "Choose a view", copy: "Use Overlay, Split, Swipe, or Text to compare the selected A/B pages, or switch to one source." },
  { number: "3", title: "Review changes", copy: "Open the collapsible Changes sidebar when you need regions, semantic changes, or comparison settings." },
] as const;

export const helpModes = [
  ["Overlay", "see additions and removals on the selected A/B page pair."],
  ["Split", "view source A and source B side by side."],
  ["Swipe", "reveal either source with a draggable divider."],
  ["Text", "compare extracted text with anchored highlights."],
  ["Source A / Source B", "inspect one source page independently; navigation follows the selected source."],
] as const;

export const helpShortcuts = [
  ["← →", "Comparison pages"],
  ["1–4", "Overlay, Split, Swipe, Text"],
  ["J / N", "Next page; K / P goes back"],
  ["M", "Cycle views"],
  ["Shift + ← →", "Source A pages"],
  ["Ctrl/Cmd + ← →", "Source B pages"],
  ["Esc", "Close or clear selection"],
] as const;
