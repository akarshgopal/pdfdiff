# @pdfdiff/pdfjs-browser

Browser adapter for PDF Diff. It owns PDF.js loading, rendering, text
extraction, and the default comparison engine while delegating comparison
algorithms to @pdfdiff/core.

The host application must provide the worker URL emitted by its bundler, and
should serve PDF.js's side-car assets so images and fonts render faithfully:

    import { createPdfJsEngine } from "@pdfdiff/pdfjs-browser";

    const engine = createPdfJsEngine({ workerSrc: pdfWorkerUrl, assetBaseUrl: "/pdfjs/" });
    const result = await engine.compare({
      earlier: fileA,
      newer: fileB,
      options: { sensitivity: 28, alignment: "none" },
      signal: new AbortController().signal,
    });

The engine can also compare any independently selected page pair. Indices are
zero-based, and the result includes the visual diff, regions, and semantic
overlays for that exact pair:

    const page = await engine.comparePagePair({
      earlier: fileA,
      newer: fileB,
      earlierPageIndex: 4,
      newerPageIndex: 2,
      options: { sensitivity: 28, alignment: "none" },
      signal: new AbortController().signal,
    });

Lower-level loadPdf, renderPage, renderPagePair, and extractPageText exports
are available when an application needs a custom pipeline.

Pass onMetric to collect opt-in timings for source reads, PDF loading, page
rendering, text extraction, alignment, visual diffing, semantic diffing, and
page/comparison totals:

    import { createDiffMetricsCollector } from "@pdfdiff/core";

    const metrics = createDiffMetricsCollector();
    await engine.compare({
      earlier: fileA,
      newer: fileB,
      options: { sensitivity: 28, alignment: "none" },
      signal: new AbortController().signal,
      onMetric: metrics.record,
    });
