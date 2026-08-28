# @pdfdiff/core

Headless comparison primitives for PDF Diff. This package is runtime-neutral:
it does not require a DOM, canvas, PDF.js, or React.

It exposes:

- diffImages and diffRenderedPages for RGBA raster comparisons
- findChangeRegions for connected-component metadata
- alignByTranslation for small raster translations
- diffSemanticText and diffSemanticPages for token and native-text changes
- shared result types and cancellation helpers

    import { diffImages } from "@pdfdiff/core";

    const result = diffImages(earlierRaster, newerRaster, {
      threshold: 0.1,
      regionOptions: { minPixels: 8 },
    });

Build with pnpm build from this workspace.
