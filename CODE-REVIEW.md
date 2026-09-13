# Code review — pre-OSS / deploy

Strict quality pass of the whole tree (2026-09-13). Algorithms and package
split are already better than most public tools. Not approved for publishing
`@pdfdiff/*` until items 1–4 below. The site can deploy after item 5.

## Verdict

Not approved for OSS packages. Site deploy is fine after hygiene (CI, fixture
NOTICE, origin/cache). Two files sit over 1k lines, READMEs document APIs that
do not exist, and a few type/state boundaries hide the real model.

## Keep

- `@pdfdiff/core` is actually headless (no DOM, no PDF.js).
- One pixel pipeline: `runRasterDiffJob`; worker is a host one-liner.
- Privacy claim matches the stack (no analytics, CSP, no Worker script).
- Almost no `any`, no TODOs, consistent abort.
- `document-alignment.ts`, `classification.ts`, `regions.ts`,
  `overlaySettings.ts`, `useViewerKeyboard.ts`, `routes.ts`.

## Work

### 1. Split 1k-line files (done)

- Split `packages/core/src/semantic.ts` (token Myers vs spatial vs page).
- Delete the empty-`items` fork in `diffSemanticPages`.
- Split `packages/viewer-react/src/PdfDiffViewer.tsx` into previews, pan/zoom,
  change walker; Help dialog lives with the other chrome.
- Delete `showSemanticHighlights` and write-only `DiffPage.textChanges` /
  `textChangeCount`.

### 2. One viewer model (done)

- Fold overlay, settings, textFilter, and modals into `useViewerState`.
- Replace `needsResolution` boolean soup with cache key
  `{ earlier, newer, quality, withLayers }`.
- Settings and Help use native `<dialog>` like pairing.

### 3. Boundaries (done)

- One overlay default + hex/RGB conversion in core.
- `classifyPage({ regions, semantic, geometry })` in core; engine calls it.
- Node must not depend on `@pdfdiff/pdfjs-browser`.

### 4. Honest public API (done)

- READMEs document ghosts: `diffRenderedPages`,
  `createDiffMetricsCollector`, `summarizeDiffMetrics`. Delete or implement.
- `--include-noise` is a no-op (`reportToText` voids `_options`). Drop the
  flag or restore the behavior.
- Named exports instead of `export *` where it leaks unused
  `PositionedTextItem` fields.
- `@pdfdiff/node` README, `publishConfig`, `development` export,
  `repository` / `bugs` / `engines` on every package.
- `tsc` does not clean `dist/` — stale `pdfjs-browser/dist/worker.js` would
  publish. Root README says three packages; there are four (plus pdfjs-text
  after item 3).
- `tests/viewer-keyboard.test.ts` imports `dist/` instead of source.

### 5. OSS / deploy hygiene (done)

- No CI (`.github/` missing). Gate format, lint, typecheck, test,
  `accuracy:check`.
- Third-party PDFs under MIT (`examples/pdf-fixtures/`, copied to
  `/samples/`). Add NOTICE or drop vendor datasheets from the public tree.
- `VITE_SITE_URL` rewrites `index.html` only; `robots.txt` / `sitemap.xml`
  stay `https://pdfdiff.app`.
- `/pdfjs/**` has no `Cache-Control`.
- `pnpm test` does not run `test:dist`; headers/pdfjs staging can rot.
- Leftovers: `.gitignore` Next/Vercel/Yarn; eslint `.next/**`; tsconfig
  `"@/*"`.
- `bench:browser` defaults to `:3000`; Vite is `:5173`.
- CONTRIBUTING.md / SECURITY.md for a file-handling tool.

## Design-system drift (not blocking)

- `text-[clamp(...)]` in `app/pdfdiff/styles.ts` and UploadScreen.
- Inline class strings in PairingControls, PageRail, ChangeNavigator.
- PairingDialog raw utilities vs the style table.

## Suggested order

1–5 are done. Playwright (`tools/verify-viewer.mjs`) checks Settings/Help as
native dialogs against a running app.
