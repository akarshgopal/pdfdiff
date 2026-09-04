export const helpSteps = [
  { number: "1", title: "Find the changes", copy: "Press N and P, or use the arrows in the toolbar, to jump between pages that changed. The stacked A and B controls move each source independently." },
  { number: "2", title: "Choose a view", copy: "Use Overlay, Split, Swipe, or Text to compare the selected A/B pages, with independent A and B page navigation." },
  { number: "3", title: "Inspect and share", copy: "Scroll to zoom and drag to pan — past 150% the page re-renders sharper on its own — then press S or use Export to save the marked-up page." },
] as const;

export const helpModes = [
  ["Overlay", "see additions and removals on the selected A/B page pair."],
  ["Split", "view source A and source B side by side."],
  ["Swipe", "reveal either source with a draggable divider."],
  ["Text", "compare extracted text with anchored highlights."],
] as const;

export const helpShortcuts = [
  ["← →", "Comparison pages"],
  ["1–4", "Overlay, Split, Swipe, Text"],
  ["N / P", "Next and previous changed page"],
  ["J / K", "Next and previous page"],
  ["M", "Cycle views"],
  ["Shift + ← →", "Source A pages"],
  ["Ctrl/Cmd + ← →", "Source B pages"],
  ["Scroll / drag", "Zoom and pan the document canvas"],
  ["+ − 0", "Zoom in, out, and back to 100%"],
  ["F", "Fullscreen"],
  ["S", "Save this page's diff image"],
  ["?", "Show these shortcuts"],
  ["Esc", "Close or clear selection"],
] as const;
