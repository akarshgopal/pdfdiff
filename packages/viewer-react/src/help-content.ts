export const helpSteps = [
  {
    number: "1",
    title: "Find the changes",
    copy: "Use Previous page and Next page to browse compared pairs. Only changed filters the page list and navigation.",
  },
  {
    number: "2",
    title: "Choose a view",
    copy: "Overlay opens first. Use Change pairing to compare different source pages temporarily.",
  },
  {
    number: "3",
    title: "Inspect and share",
    copy: "Previous and Next change step through the page one change at a time. Scroll to pan, pinch or Ctrl-scroll to zoom, and use Export to save the marked-up page.",
  },
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
  ["J / K", "Next and previous page"],
  ["Shift + ← →", "Move document A alone"],
  ["Ctrl/Cmd + ← →", "Move document B alone"],
  ["M", "Cycle views"],
  ["Scroll / drag", "Pan the document canvas"],
  ["Pinch / Ctrl + scroll", "Zoom"],
  ["+ − 0", "Zoom in, out, and back to 100%"],
  ["F", "Fullscreen"],
  ["S", "Save this page's diff image"],
  ["?", "Show these shortcuts"],
  ["Esc", "Close or clear selection"],
] as const;
