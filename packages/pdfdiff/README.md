# pdfdiff

Compare two PDF revisions from the command line or Node. It reports wording
edits, page structure, and a pixel overlay of the drawing — the same comparison
the [browser app](https://pdfdiff.app) runs, without a browser.

Requires Node `>=22.13.0`. CLI packages ship as **0.1.0**. The repo tag
`v1.0.0` is the app/site release, not the npm CLI version.

## Install

```bash
npx pdfdiff earlier.pdf newer.pdf
npx pdfdiff earlier.pdf newer.pdf --report json --fail-on-change
npx pdfdiff earlier.pdf newer.pdf --images ./diff-out
```

```ts
import { comparePdfs } from "pdfdiff";

const { report } = await comparePdfs("earlier.pdf", "newer.pdf");
```

Also available from source in this monorepo (contributors):

```bash
pnpm install
pnpm run build:packages
pnpm exec pdfdiff earlier.pdf newer.pdf
```

Prefer `pnpm exec pdfdiff` over `pnpm pdfdiff` in CI: a non-zero CLI exit
otherwise becomes a pnpm ELIFECYCLE error.

## CLI

```
pdfdiff <earlier.pdf> <newer.pdf> [options]
```

| Option                               | Meaning                                              |
| ------------------------------------ | ---------------------------------------------------- |
| `--report text\|json\|csv\|markdown` | Output format (default `text`)                       |
| `--out <path>`                       | Write the report to a file instead of stdout         |
| `--images <dir>`                     | Write overlay PNGs for changed pages                 |
| `--text-only`                        | Skip pixel comparison                                |
| `--fail-on-change`                   | Exit 1 when a substantive change is found            |
| `--fail-on-unreadable`               | Exit 1 when a page's text could not be decoded       |
| `--no-detect-moves`                  | Treat moved pages as a removal plus an addition      |
| `--no-align`                         | Do not shift pages to cancel a small translation     |
| `--threshold <0..1>`                 | Page-match threshold (default `0.55`)                |
| `--sensitivity <0..100>`             | Pixel-diff sensitivity (default `28`)                |
| `--quiet`                            | Suppress progress and warnings (report still prints) |
| `-V, --version`                      | Print the version                                    |
| `-h, --help`                         | Show usage                                           |

Exit codes: `0` ok, `1` `--fail-on-*` tripped, `2` usage, `3` runtime.

Warnings go to stderr. The report goes to stdout, or to `--out`. Overlay files
are named `a{earlier}-b{newer}.png`.

JSON shape: import `pdfdiff/report.schema.json`. Agent notes: `llms.txt` in this
package.

## What it compares

By default, each aligned page is rasterised and pixel-diffed, then classified
against the extracted-text layer so a moved paragraph is not reported as a
rewrite. `--text-only` is the fast path for wording-only CI.

Visual output is close to pdfdiff.app, not pixel-identical: Node renders through
Skia (`@napi-rs/canvas`), the site through the browser canvas.

A page whose fonts carry no Unicode mapping still participates in the visual
diff. Its text cannot. `--fail-on-unreadable` makes that a hard failure.

## Node API

```ts
import { comparePdfs, comparePdfText } from "pdfdiff";

const visual = await comparePdfs("a.pdf", "b.pdf", {
  onOverlay: async ({ earlierPage, newerPage, overlay }) => {
    // RGBA overlay for each changed page
  },
});

const text = await comparePdfText("a.pdf", "b.pdf");
```

`comparePdfText` is `{ visual: false }`.

## Publishing

The published packages are `@pdfdiff/core`, `@pdfdiff/pdfjs-text`, and
`pdfdiff`, all at `0.1.0`. `workspace:*` is rewritten by `pnpm publish` from
the monorepo; `pnpm pack` alone does not produce a consumer-installable
tarball. Publish order: core → pdfjs-text → pdfdiff, with `--access public`.
