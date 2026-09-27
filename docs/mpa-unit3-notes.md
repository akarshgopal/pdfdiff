# MPA unit 3

Branch: `mpa-landing-app`. Smallest change. No mobile (#3), no pixel (#4), no `seo` merge, no deploy.

## Checked

- `public/sitemap.xml` and `public/robots.txt`
- `<title>`, description, canonical, `og:*`, and `twitter:*` on `index.html`, `privacy/index.html`, `terms/index.html`, and `app/index.html`
- `wrangler.jsonc` (`assets.not_found_handling`, and HTML redirect handling)
- `public/_headers`. No `_redirects`, `_routes.json`, or other Cloudflare redirect file in the repo
- `app/pdfdiff/routes.ts` and `main.tsx` for a client router that would still treat `/` as the workspace

## Already consistent

| Page       | Canonical / `og:url`          | Title                                                 |
| ---------- | ----------------------------- | ----------------------------------------------------- |
| `/`        | `https://pdfdiff.app/`        | Compare two PDFs privately in your browser \| pdfdiff |
| `/app`     | `https://pdfdiff.app/app`     | Compare PDFs in your browser \| pdfdiff               |
| `/privacy` | `https://pdfdiff.app/privacy` | Privacy Policy — pdfdiff                              |
| `/terms`   | `https://pdfdiff.app/terms`   | Terms of Service — pdfdiff                            |

On each page, description, `og:title`, `og:description`, `og:url`, `twitter:title`, and `twitter:description` match that page's title, description, and canonical. Strings match `ROUTE_DOCUMENT_META` in `routes.ts`. Robots on all four are `index, follow, max-image-preview:large`.

Sitemap `<loc>` values are those four URLs plus `https://pdfdiff.app/llms.txt`. Nothing that is an HTML page is missing. `robots.txt` allows `/`, disallows `/samples/`, and points at `https://pdfdiff.app/sitemap.xml`.

`main.tsx` calls `applyDocumentMeta("app")` and is loaded only from `app/index.html`. Landing and legal pages ship their tags in the HTML files. Homepage JSON-LD (`WebApplication`) is only on `/`. `/app` does not repeat it.

## Changed

`wrangler.jsonc` `assets.html_handling` was unset. Cloudflare's default is `auto-trailing-slash`: a directory index such as `privacy/index.html` is served at `/privacy/` and `/privacy` is a 307 to `/privacy/`. The same applies to `/terms` and `/app`.

Canonicals, sitemap locations, and in-page links (`href="/app"`, `href="/privacy"`, `href="/terms"`) use the no-slash URLs. Those links and the sitemap were pointing at the redirect, not the URL that returns 200.

Set `html_handling` to `drop-trailing-slash`. `/privacy`, `/terms`, and `/app` are the 200s. The slashed forms 307 back to them. `/` is unchanged (root `index.html`). `not_found_handling` is still `single-page-application`.

`tests/rendered-html.test.mjs` now asserts both `html_handling` and `not_found_handling`.

Vite's MPA server does the opposite of that host rule. `vite preview` returned 404 for `/app`, `/privacy`, and `/terms`, and 200 only for the slashed forms (`/app/`, and the same for privacy and terms). The landing CTA is `href="/app"`, so the compare workspace 404s locally. `mpaDirectoryIndexes` in `vite.config.ts` rewrites the bare path to the directory index and 307s `/app/`, `/privacy/`, `/terms/`, and the `index.html` variants back to the bare path. Unknown paths still 404 in dev and preview. `mpaDirectoryRequest` is covered in `tests/seo.test.ts`.

## Left alone

- `not_found_handling: "single-page-application"`. An unknown path on Cloudflare still falls back to the marketing `index.html` (canonical `/`, indexable). Vite `appType: "mpa"` still 404s unknown paths locally. Documented in unit 1 and unit 2. Not switched to `404-page`.
- No `_redirects` file. `html_handling` is the redirect that matches the existing URL style. A second redirect list would duplicate it.
- Sitemap already includes `/app`. `lastmod` dates were not bumped.
- `routes.ts` still maps unknown paths to `"not-found"` for meta helpers and tests. Nothing in the product mounts that route. `applyDocumentMeta` is not called for it.
- Shared `og.png` alt text still describes the landing screenshot on every page, because that is the image.
- WebApplication JSON-LD `url` stays `https://pdfdiff.app/`. `site.webmanifest` `start_url` stays `/`. The marketing page is the front door. There is no redirect from `/` to `/app`.
- No mobile work, no pixel work, no `seo` branch merge, no deploy.
