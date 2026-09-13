# @pdfdiff/core

Headless comparison primitives for PDF Diff. This package is runtime-neutral:
it does not require a DOM, canvas, PDF.js, or React.

It exposes:

- `diffImages` for RGBA raster comparisons
- `findChangeRegions` for connected-component metadata
- `alignByTranslation` for small raster translations
- `diffSemanticText` and `diffSemanticPages` for token and native-text changes
- `classifyPage` to label pixel regions from the semantic layer
- shared result types and cancellation helpers
- opt-in phase timings through `DiffMetricSink`

```ts
import { diffImages } from "@pdfdiff/core";

const result = diffImages(earlierRaster, newerRaster, {
  threshold: 0.1,
  regionOptions: { minPixels: 8 },
});
```

Build with `pnpm build` from this workspace.

To profile a comparison without coupling the algorithms to a logging system:

```ts
import { createDiffMetricsCollector, diffImages, summarizeDiffMetrics } from "@pdfdiff/core";

const metrics = createDiffMetricsCollector();
diffImages(earlierRaster, newerRaster, { metrics: metrics.sink });
console.table(summarizeDiffMetrics(metrics.snapshot()));
```

The browser PDF adapter accepts the same sink as `onMetric` on
`DiffEngine.compare`. If no sink is supplied, instrumentation is disabled.
