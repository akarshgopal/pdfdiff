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
- `pnpm build`: build the packages and static Vite application
- `pnpm start`: preview the production build locally
- `pnpm deploy:dry-run`: build and validate the Cloudflare asset deployment
- `pnpm deploy`: build and deploy the static assets to Cloudflare
- `pnpm test`: build and run the rendered HTML, core, and semantic tests
- `pnpm lint`: run ESLint
- `pnpm bench:core`: run deterministic core performance and quality scenarios
- `pnpm bench:browser`: run the app through Playwright and Chromium
- `pnpm screenshots`: recapture the landing page screenshots in `public/shots`
- `pnpm run bench:report -- --baseline=... --current=...`: compare benchmark JSON

## Landing page screenshots

The screenshots on the landing page are captured from the real workspace rather
than mocked up. `tools/capture-screenshots.mjs` drives a built site with
Playwright, compares a fixture pair from `examples/pdf-fixtures/` for each view,
and writes light and dark WebP files into `public/shots`. Regenerate them
whenever the workspace chrome changes:

```bash
pnpm build && pnpm start &
pnpm screenshots -- --url=http://localhost:4173/
```

The encode step needs ImageMagick (`magick`) and `cwebp` on `PATH`; pass
`--skip-encode` to stop at the PNGs. The captions that describe each shot live
in `app/pdfdiff/landing-content.ts` and name the fixture pair, so keep the two
in step.

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
