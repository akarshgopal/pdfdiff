# @pdfdiff/pdfjs-browser

Browser adapter for PDF Diff. It owns PDF.js loading, rendering, text
extraction, and the default comparison engine while delegating comparison
algorithms to @pdfdiff/core.

The host application must provide the worker URL emitted by its bundler:

    import { createPdfJsEngine } from "@pdfdiff/pdfjs-browser";

    const engine = createPdfJsEngine({ workerSrc: pdfWorkerUrl });
    const result = await engine.compare({
      earlier: fileA,
      newer: fileB,
      options: { sensitivity: 28, alignment: "none" },
      signal: new AbortController().signal,
    });

Lower-level loadPdf, renderPage, renderPagePair, and extractPageText exports
are available when an application needs a custom pipeline.
