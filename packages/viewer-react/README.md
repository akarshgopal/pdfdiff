# @pdfdiff/viewer-react

Reusable React viewer for completed PDF Diff comparisons. The viewer is
headless with respect to file loading: pass it a DiffComparison and it handles
page navigation, comparison views, source A/B inspection, change selection,
settings controls, keyboard shortcuts, and the help dialog.

    import { PdfDiffViewer } from "@pdfdiff/viewer-react";

    export function Review({ comparison }) {
      return <PdfDiffViewer comparison={comparison} />;
    }

The package exports PdfDiffViewer, its comparison/viewer types, and the
styles/styleProps helpers used by the default Tailwind-based presentation.

## Workspace model

The workspace has one comparison page rail with vertically stacked A/B page
controls. Step either source independently, or select a single overlay thumbnail
to realign both sources to that page. The primary comparison views are:

- **Overlay** — show visual additions and removals on the selected A/B pair.
- **Split** — show source A and source B side by side.
- **Swipe** — reveal either source with a draggable divider.
- **Text** — compare extracted text with anchored highlights.

The change inspector is collapsed by default. Open it when you need visual
regions, semantic changes, or comparison settings. Keyboard shortcuts cover
page movement, view selection, source A/B navigation, and closing or clearing
the current selection.

To support Overlay, Swipe, or Text when A and B are stepped to different page
numbers, provide `DiffComparison.comparePagePair`. The viewer invokes it on
demand for the selected source pair. Source A/B views continue to show the
independently selected original pages.

## Styling

The default viewer is Tailwind CSS v4 based. Import the package theme before
rendering the viewer and make sure your Tailwind stylesheet scans the package's
compiled `dist` files so its utility classes are generated:

```css
@import "tailwindcss";
@import "@pdfdiff/viewer-react/theme.css";
```

The exported theme owns the viewer's CSS variables and dark-mode palette. The
application and the package therefore share one styling contract.
