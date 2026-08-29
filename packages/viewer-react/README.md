# @pdfdiff/viewer-react

Reusable React viewer for completed PDF Diff comparisons. The viewer is
headless with respect to file loading: pass it a DiffComparison and it handles
page navigation, visual and semantic modes, source-page inspection, change
selection, settings controls, keyboard shortcuts, and the help dialog.

    import { PdfDiffViewer } from "@pdfdiff/viewer-react";

    export function Review({ comparison }) {
      return <PdfDiffViewer comparison={comparison} />;
    }

The package exports PdfDiffViewer, its comparison/viewer types, and the
styles/styleProps helpers used by the default Tailwind-based presentation.
To support visual and semantic comparison when A and B are stepped to different
page numbers, provide `DiffComparison.comparePagePair`; the viewer invokes it
on demand and keeps all view modes on the independently selected pair.

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
