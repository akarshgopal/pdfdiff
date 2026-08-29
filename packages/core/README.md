# @pdfdiff/core

Headless comparison primitives for PDF Diff. This package is runtime-neutral:
it does not require a DOM, canvas, PDF.js, or React.

It exposes:

- diffImages and diffRenderedPages for RGBA raster comparisons
- findChangeRegions for connected-component metadata
- alignByTranslation for small raster translations
- diffSemanticText and diffSemanticPages for token and native-text changes
- shared result types and cancellation helpers
- opt-in phase timings and memory samples through DiffMetricSink

    import { diffImages } from "@pdfdiff/core";

    const result = diffImages(earlierRaster, newerRaster, {
      threshold: 0.1,
      regionOptions: { minPixels: 8 },
    });

Build with pnpm build from this workspace.

To profile a comparison without coupling the algorithms to a logging system:

    import { createDiffMetricsCollector, diffImages, summarizeDiffMetrics } from "@pdfdiff/core";

    const metrics = createDiffMetricsCollector();
    diffImages(earlierRaster, newerRaster, { metrics: metrics.sink });
    console.table(summarizeDiffMetrics(metrics.snapshot()));

The browser PDF adapter accepts the same sink as onMetric on
DiffEngine.compare, adding load, render, text, page, and total-comparison
events. If no sink is supplied, instrumentation is disabled.
