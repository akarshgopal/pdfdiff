/**
 * Landing copy lives apart from the in-workspace help text: the help panel
 * explains controls to someone already looking at them, while this describes
 * the product to someone who has not opened it yet.
 */

export interface ShowcaseView {
  id: "overlay" | "split" | "swipe" | "text";
  label: string;
  title: string;
  copy: string;
  /** The fixture pair in the screenshot, so the caption stays honest. */
  source: string;
}

export const showcaseViews: ShowcaseView[] = [
  {
    id: "overlay",
    label: "Overlay",
    title: "Spot visual changes",
    copy: "Earlier content is red, newer content is teal, and unchanged areas stay grey.",
    source: "Machine drawing · rev A → rev B",
  },
  {
    id: "split",
    label: "Split",
    title: "Compare pages side by side",
    copy: "Matched pages stay aligned, even when a revision adds or removes pages.",
    source: "TI SN74HC595 datasheet · rev I → rev J",
  },
  {
    id: "swipe",
    label: "Swipe",
    title: "Check a change precisely",
    copy: "Drag the divider to reveal one revision beneath the other.",
    source: "OLIMEXINO-STM32 schematic · rev A → rev B",
  },
  {
    id: "text",
    label: "Text",
    title: "Read the wording that changed",
    copy: "See added and removed words highlighted in place on the page.",
    source: "Work order contract · original → amended",
  },
];
