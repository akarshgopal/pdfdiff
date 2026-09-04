# PDF Diff Help

PDF Diff compares two PDF revisions in your browser so you can review what
changed page by page. The first file is the **Earlier** version (the original)
and the second file is the **Newer** version (the revision).

## Quick start

1. Add the original PDF to **Earlier** by dropping it on the card or choosing
   **browse**.
2. Add the revision to **Newer**. You can also choose both PDFs from either
   file picker; the first selected file fills the card you opened and the
   second fills the other card.
3. Use the swap button if the versions are in the wrong order.
4. Select **Compare**. PDF Diff renders the pages, compares their pixels,
   and checks their extracted text.

PDF files must be smaller than 150 MB. A file can be replaced from its card or
removed with the × button before starting the comparison.

## How to read a comparison

- The page rail on the left lists every page and its status. A check mark means
  **No changes**; a dot means **Changes found**; `+` and `−` mark added and
  removed pages.
- The center canvas shows the selected page. In **Diff** mode, changed areas
  are highlighted and can be selected directly.
- The **Change inspector** shows the changed area percentage for the current
  page, detected regions, and available text changes.
- Turn **Show bounding boxes** off when you want an unobstructed view of the
  diff.

## View modes

Use the view mode buttons above the canvas to switch between:

- **Diff** — the visual change overlay.
- **Semantic text** — compare extracted text and inspect anchored native-PDF
  highlights for additions, removals, and replacements.
- **Side by side** — the Earlier and Newer pages next to each other.
- **Swipe** — drag the divider across the page to reveal the Newer version.
- **Blink** — alternates between the two versions automatically.
- **Earlier** and **Newer** — inspect one source version on its own.

You can zoom from 50% to 200% with the − and + controls. The Pages rail shows
paired Earlier/Newer previews and has independent A and B page controls that
work in every view mode. The open-page buttons launch the selected source page
in a larger full-page view. Diff and Semantic text calculate their results for
the currently selected A/B page pair, even when the page numbers differ.

## Comparison settings

Open **Comparison settings** in the inspector before starting a comparison.

- **Sensitivity** controls how much pixel-level variation is treated as a
  change. Increase it to ignore more small differences; lower it to surface
  more subtle differences.
- **Alignment: Translation only** compensates for small horizontal or vertical
  shifts before comparing the pages.

Settings are used when the comparison starts. To apply a new setting to an
existing pair, choose **New comparison**, keep the files selected, adjust the
setting, and compare again.

## Keyboard shortcuts

- `N` / `P`: next or previous page that actually changed, skipping the rest.
- `←` / `→`, `Page Up` / `Page Down`, or `J` / `K`: previous or next comparison
  page, changed or not.
- `Shift` + `←` / `→`: previous or next Earlier source page.
- `Ctrl`/`Cmd` + `←` / `→`: previous or next Newer source page.
- `1`–`4`: choose Overlay, Split, Swipe, or Text.
- `[` / `]` or `Shift` + `M` / `M`: cycle view modes backward or forward.
- `Home` / `End`: jump to the first or last page. With `Shift`, target Earlier;
  with `Ctrl`/`Cmd`, target Newer.
- `+` / `-` / `0`: zoom in, out, or back to 100%. `F` toggles fullscreen.
- `S`: save the marked-up page as an image. `?`: show this list in the app.
- `Escape`: close full-page view or clear the selected change.
- In Swipe mode, focus the divider and use the arrow keys to move it; hold
  `Shift` for larger steps.

## Privacy and limits

PDF Diff processes files locally in the browser. The PDFs are not uploaded to
an application server. Recent comparison history contains only filenames, file
sizes, dates, and comparison settings; PDFs must be selected again for another
comparison. The app accepts PDF files up to 150 MB each and needs a browser
with a working canvas for rendering and comparison.

PDF Diff shows the detected visual and text differences to help with review;
it does not edit, merge, or export PDF files.
