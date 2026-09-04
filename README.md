# PDF Diff

PDF Diff is a static React application that compares two PDF revisions locally
in the browser. It renders visual
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
- `main.tsx` and `index.html` — the static Vite application entry and metadata.

## The raster diff worker

Aligning and diffing two rendered pages is the expensive half of a comparison
and the only half that never touches PDF.js — roughly 3.9s of a 10s 43-page run
against 2.5s of canvas rendering. `@pdfdiff/pdfjs-browser` runs it on a Web
Worker, so page rendering on the main thread and pixel work on the worker
overlap, and the UI keeps painting throughout.

The host owns the `new Worker(...)` call, because only it knows how its bundler
emits the module. The worker file is one line:

```ts
// app/rasterDiffWorker.ts
import { serveRasterDiffWorker } from "@pdfdiff/pdfjs-browser/raster-diff-worker";

serveRasterDiffWorker();
```

```ts
const engine = createPdfJsEngine({
  workerSrc: pdfWorkerUrl,
  assetBaseUrl: "/pdfjs/",
  createRasterDiffWorker: () => new Worker(new URL("./rasterDiffWorker.ts", import.meta.url), { type: "module" }),
});
```

`createRasterDiffWorker` is optional. Without it — and whenever the worker
cannot be constructed — the same code runs in-process, which is why
`@pdfdiff/node` needs no worker at all.

Page rasters are transferred rather than copied, so handing a page to the
worker costs no memory. The overlap does: the batch pass keeps one page of
lookahead, so peak memory is two pages of rasters (~72 MB at the standard
3 MP budget) rather than one. That bound does not grow with page count.

Build the packages independently with:

```bash
pnpm build:packages
```

The package manifests contain `main`, `types`, `exports`, `files`, and
workspace dependency boundaries for a future publish step. The browser adapter
expects its host bundler to provide the PDF.js worker URL:

```ts
import { createPdfJsEngine } from "@pdfdiff/pdfjs-browser";

const engine = createPdfJsEngine({ workerSrc: pdfWorkerUrl, assetBaseUrl: "/pdfjs/" });
const comparison = await engine.compare({
  earlier: earlierFile,
  newer: newerFile,
  options: { sensitivity: 28, alignment: "none" },
  signal: new AbortController().signal,
});
```

`assetBaseUrl` points at PDF.js's own side-car assets (`standard_fonts/`,
`cmaps/`, `wasm/`, `iccs/`, copied from `pdfjs-dist`). It is optional but
effectively required for accurate results: without it PDF.js drops JBIG2 and
JPX images from the render and guesses metrics for non-embedded base-14 fonts,
and the raster diff reports the difference as a real change.


## Useful commands

- `pnpm dev`: start local development
- `pnpm build`: build the packages and static Vite application
- `pnpm start`: preview the production build locally
- `pnpm deploy:dry-run`: build and validate the Cloudflare asset deployment
- `pnpm deploy`: build and deploy the static assets to Cloudflare
- `pnpm test`: build the packages and run the unit tests
- `pnpm run test:dist`: build the site and check the shipped `dist/` output
- `pnpm lint`: run ESLint
- `pnpm bench:core`: run deterministic core performance and quality scenarios
- `pnpm bench:browser`: run the app through Playwright and Chromium
- `pnpm run bench:report -- --baseline=... --current=...`: compare benchmark JSON


## Deployment

The `wrangler.jsonc` configuration deploys `dist/` through Cloudflare Workers
Static Assets. It has no Worker script, server-side rendering, runtime bindings,
or server-side upload endpoint. Static asset requests do not execute Worker
compute.

Set `VITE_SITE_URL` to the canonical origin at build time to add absolute
canonical, Open Graph, and X image URLs. For example:

```bash
VITE_SITE_URL=https://pdfdiff.example pnpm build
```

PDFs are processed entirely in the browser. Recent comparison history stores
only filenames, sizes, dates, and comparison settings; users select the source
files again when repeating a comparison.

## Repository notes

- Edit product code under `app/`.
- Keep reusable comparison code in `packages/`.
- Keep `pnpm-lock.yaml` as the only package-manager lockfile.

## Learn More

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
