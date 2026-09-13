# Contributing

## Setup

Node `>=22.13.0` and pnpm `>=11`. Then:

```bash
pnpm install
pnpm test
pnpm lint
pnpm format:check
```

`pnpm dev` starts the Vite app. Packages build to `dist/` first (`predev`).

## Layout

Keep comparison algorithms in `@pdfdiff/core`. PDF.js loading and rendering
stay in `@pdfdiff/pdfjs-browser`. Text extraction that Node also needs lives
in `@pdfdiff/pdfjs-text`. The React workspace is `@pdfdiff/viewer-react`.
Product chrome (upload, samples, legal pages) stays under `app/`.

Use `pnpm` only. Prettier owns formatting (120 columns).

## Checks

- `pnpm test` — unit tests (builds packages first)
- `pnpm test:dist` — production `dist/` smoke, including headers and PDF.js assets
- `pnpm accuracy:check` — fixture text-accuracy corpus
- `pnpm typecheck` / `pnpm lint` / `pnpm format:check`

CI runs those, then Playwright against `vite preview` via
`tools/verify-viewer.mjs`.

## Pull requests

Keep the diff scoped. Do not commit `dist/`, `public/pdfjs/`, or
`public/samples/` — Vite stages those on build. If you add a sample PDF,
record provenance and hashes in `examples/pdf-fixtures/README.md` and
`NOTICE`.
