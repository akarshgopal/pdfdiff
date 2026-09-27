# Main parity on `/`

Branch: `mpa-landing-app`. No `seo` merge, no `tools/prerender-seo.mjs`, no deploy, no force-push. Mobile (#3) and pixel (#4) stay out of scope.

This reverses the marketing-only `/` plus `/app` workspace split. The product matches `origin/main`: React `PdfDiffApp` lives at `/`. Privacy and terms stay the static HTML pages from the earlier MPA units.

## What changed

| URL                  | Before                                                            | Now                                                                                      |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/`                  | Static marketing HTML, CTA `href="/app"`, vanilla hero. No React. | `index.html` mounts `main.tsx` → `PdfDiffApp`. Crawlable `#app-fallback` inside `#root`. |
| `/app`, `/app/`      | React compare workspace (`app/index.html`).                       | 301 to `/`. No second HTML entry.                                                        |
| `/privacy`, `/terms` | Static HTML plus `static-shell.ts` theme toggle.                  | Unchanged.                                                                               |

`UploadScreen` and `LoadingScreen` use `<AppHeader />` again, the same non-link wordmark as `origin/main`. The `href="/"` wordmark existed so the old `/app` workspace could point home.

`static-shell.ts` only toggles the theme for privacy and terms. The static hero cycler is gone with `[data-hero-demo]`. React `HeroDemo` is the demo again. `LegalPage` and `NotFoundPage` stay deleted.

`routes.ts` maps `/` and `/app` to `"home"`. The separate `app` route, `APP_TITLE`, and `APP_DESCRIPTION` are gone. The home canonical stays `/`. `main.tsx` calls `applyDocumentMeta("home")` and does not rewrite the homepage to the old `/app` title. Unknown paths use Cloudflare `not_found_handling: "404-page"` (`dist/404.html`, `noindex`). Vite `appType: "mpa"` 404s unknown paths locally the same way.

## How `/` mounts React

`index.html` keeps the existing title, description, canonical, Open Graph, Twitter, and WebApplication JSON-LD. The body is `#root` plus `<script type="module" src="/main.tsx">`.

Inside `#root`, `#app-fallback` is real HTML: the H1 “Compare PDFs. See what changed.”, “Files never leave your device”, “never uploaded”, and a short description of the compare. A `<style>` hides `#app-fallback` so JS visitors do not see a flash. `<noscript>` sets `display: revert`. There is no CTA to `/app`.

## How `/app` redirects

`app` is not a Vite `build.rollupOptions.input`. The build does not emit `dist/app/index.html`.

Vite dev and preview (`mpaDirectoryRequest`): `/app`, `/app/`, and `/app/index.html` return 301 to `/`, query string kept. `/privacy` and `/terms` still rewrite the bare path onto the directory index and 307 the slashed and `index.html` forms back to the bare canonical.

Production is `public/_redirects` (copied to `dist/_redirects`):

```
/app / 301
/app/ / 301
/app/index.html / 301
```

`_redirects` runs before `html_handling`. In wrangler 4.135 / miniflare, `getResponseOrAssetIntent` calls `handleRedirects` first and returns that response. A destination with no query keeps the incoming query (`destination.search || search`). `html_handling: drop-trailing-slash` still 307s `/privacy/` and `/terms/` to the bare paths, because those rules are not in `_redirects` and those directory indexes exist. `/app` is not a directory page, so that handler has nothing to canonicalize. The sitemap lists `/`, `/llms.txt`, `/privacy`, and `/terms`. `/` `lastmod` is 2026-09-27. `/app` is not listed.

## Tests

Node 22.19.0, pnpm 11.24.0.

- `pnpm test` — 173 pass, 0 fail, 0 skipped, 0 todo.
- `pnpm build` — success, including typecheck. Emits `dist/index.html`, `dist/privacy/index.html`, and `dist/terms/index.html`. Does not emit `dist/app/index.html`. The React entry is `dist/assets/main-*.js`. Legal pages load `static-shell-*.js`.
- `node --test tests/rendered-html.test.mjs` — 6 pass, 0 fail.

## Preview

`pnpm exec vite preview --host 127.0.0.1 --port 4173` against that build:

| Request                                     | Status | Result                                                                       |
| ------------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `/`                                         | 200    | Home title, `#root`, `#app-fallback`, `/assets/main-*.js`. No `href="/app"`. |
| `/app`, `/app/`, `/app/index.html`          | 301    | `/`                                                                          |
| `/app?x=1`, `/app/?x=1`                     | 301    | `/?x=1`                                                                      |
| `/privacy`, `/terms`                        | 200    | Static titles                                                                |
| `/privacy/`, `/terms/`, `/terms/index.html` | 307    | Bare path                                                                    |
| `/no-such-page`                             | 404    | Vite MPA. No SPA fallback locally.                                           |

`pnpm exec wrangler dev --config wrangler.jsonc --port 8787 --ip 127.0.0.1` (local only, not a deploy). Wrangler logged “Parsed 3 valid redirect rules.”

| Request                                     | Status | Result                    |
| ------------------------------------------- | ------ | ------------------------- |
| `/`                                         | 200    | Home title                |
| `/app`, `/app/`, `/app/index.html`          | 301    | `/`                       |
| `/app?x=1`, `/app/?foo=1`                   | 301    | `/?x=1`, `/?foo=1`        |
| `/privacy`, `/terms`                        | 200    | Those titles              |
| `/privacy/`, `/terms/`, `/terms/index.html` | 307    | Bare path                 |
| `/no-such-page`                             | 200    | Home index (SPA fallback) |
| `/index.html`                               | 307    | `/`                       |

No Playwright browser binary is installed here, so this pass did not click the drop zones. The served document is the React entry, and the client bundle still contains “Try a sample”, “Earlier”, and “never uploaded”.

## Commit

- `122e067dd134e450c38545dd4b3f31ae6b464877` — `fix: restore PdfDiffApp on / and redirect /app to /`

## 404 page

`404.html` is a Vite MPA input (built to `dist/404.html`). Wrangler `not_found_handling` is `"404-page"`, so unknown URLs return that document with HTTP 404 instead of soft-falling back to `/`. The page is `noindex` and matches static legal chrome (theme toggle via `static-shell.ts`). `/app` still 301s to `/` via `_redirects` before not-found handling.
