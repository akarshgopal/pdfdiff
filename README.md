# PDF Diff

PDF Diff compares two PDF revisions locally in the browser. It renders visual
diffs, extracts semantic text changes, and provides a focused page-by-page
review workspace. See HELP.md for the user guide.

## Prerequisites

- Node.js `>=22.13.0`
- pnpm `>=11`

## Quick Start

```bash
pnpm install
pnpm dev
pnpm build
```

## Package architecture

The application is split into three workspace packages so the comparison
logic can be reused independently of the browser app:

- `@pdfdiff/core` — headless raster, alignment, connected-region, and semantic
  text comparison algorithms. It has no DOM or PDF.js dependency.
- `@pdfdiff/pdfjs-browser` — the browser/PDF.js adapter that loads and renders
  PDF files, then orchestrates the core algorithms.
- `@pdfdiff/viewer-react` — a reusable React viewer for a completed comparison.
  It owns navigation, view modes, inspection controls, and keyboard shortcuts.
- `app/` — the product shell: upload flow, privacy messaging, loading state,
  default engine wiring, analytics callbacks, and the in-app help section.

Build the packages independently with:

```bash
pnpm build:packages
```

The package manifests contain `main`, `types`, `exports`, `files`, and
workspace dependency boundaries for a future publish step. The browser adapter
expects its host bundler to provide the PDF.js worker URL:

```ts
import { createPdfJsEngine } from "@pdfdiff/pdfjs-browser";

const engine = createPdfJsEngine({ workerSrc: pdfWorkerUrl });
const comparison = await engine.compare({
  earlier: earlierFile,
  newer: newerFile,
  options: { sensitivity: 28, alignment: "none" },
  signal: new AbortController().signal,
});
```

## Useful commands

- `pnpm dev`: start local development
- `pnpm build`: build the packages and the vinext app
- `pnpm test`: build and run the rendered HTML, core, and semantic tests
- `pnpm lint`: run ESLint

## Deployment

The app runs on [vinext](https://github.com/cloudflare/vinext) and uses the
Cloudflare Sites project configuration in `.openai/hosting.json`. PDFs are
processed in the browser; there is no server-side upload endpoint. Set
`NEXT_PUBLIC_SITE_URL` to the canonical origin when deploying behind a proxy;
otherwise the app uses validated request host headers for metadata URLs.

## Repository notes

- Edit product code under `app/`.
- Keep reusable comparison code in `packages/`.
- Keep `pnpm-lock.yaml` as the only package-manager lockfile.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
