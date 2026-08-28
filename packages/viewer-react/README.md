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
