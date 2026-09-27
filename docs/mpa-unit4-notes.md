# MPA unit 4

Branch: `mpa-landing-app`. No deploy, no PR, no mobile (#3), no pixel (#4), no `seo` merge.

## Commands

Node 22.19.0, pnpm 11.24.0. Counts are from the runs after the unit 3 code was in place.

- `pnpm test` — 173 pass, 0 fail, 0 skipped, 0 todo.
- `pnpm build` — success. Typecheck included. Emits `dist/index.html`, `dist/privacy/index.html`, `dist/terms/index.html`, and `dist/app/index.html`.
- `node --test tests/rendered-html.test.mjs` — 6 pass, 0 fail. Same file `pnpm test:dist` runs after its own build. `test:dist` was not run again on top of this build.

## Smoke

Built files, canonical and `og:url`:

| URL         | File                      | Canonical                     |
| ----------- | ------------------------- | ----------------------------- |
| `/`         | `dist/index.html`         | `https://pdfdiff.app/`        |
| `/privacy/` | `dist/privacy/index.html` | `https://pdfdiff.app/privacy` |
| `/terms/`   | `dist/terms/index.html`   | `https://pdfdiff.app/terms`   |
| `/app/`     | `dist/app/index.html`     | `https://pdfdiff.app/app`     |

Titles match the unit 3 table. `dist/robots.txt`, `dist/sitemap.xml`, `dist/_headers`, `dist/llms.txt`, and `dist/og.png` are present. Sitemap locations are `/`, `/app`, `/llms.txt`, `/privacy`, and `/terms`.

`pnpm exec wrangler dev --config wrangler.jsonc --port 8787 --ip 127.0.0.1` (local only, not a deploy):

| Request                                                       | Status | Result                         |
| ------------------------------------------------------------- | ------ | ------------------------------ |
| `/`                                                           | 200    | Marketing title                |
| `/index.html`                                                 | 307    | `/`                            |
| `/privacy`, `/terms`, `/app`                                  | 200    | That page's title              |
| `/privacy/`, `/terms/`, `/app/`                               | 307    | Bare path                      |
| `/privacy/index.html`, `/terms/index.html`, `/app/index.html` | 307    | Bare path                      |
| `/no-such-page`                                               | 200    | Marketing index (SPA fallback) |
| `/robots.txt`, `/sitemap.xml`, `/llms.txt`                    | 200    | Those files                    |

`pnpm exec vite preview --host 127.0.0.1 --port 4173` before the directory-index plugin: `/privacy`, `/terms`, and `/app` were 404. The slashed forms were 200. `/no-such-page` was 404.

After the plugin, preview and `pnpm exec vite --host 127.0.0.1 --port 5173` both return 200 for `/`, `/privacy`, `/terms`, and `/app` with the right titles and canonicals, 307 the slashed forms back to the bare path, and 404 `/no-such-page`.

Oddity, left as documented: an unknown path is 404 on Vite and 200 marketing HTML on wrangler. `/no-such-page/` on wrangler is also that marketing 200. It is not a directory index, so `drop-trailing-slash` does not redirect it.

## Commits

- `6e72e2336e33bae8f939a9bcd0013a885e31e1c6` — `fix(seo): serve MPA directory pages at their no-slash canonicals` (unit 3 code and `docs/mpa-unit3-notes.md`)
- This file is the next commit, `docs: record mpa unit 4 verification`, parent `6e72e2336e33bae8f939a9bcd0013a885e31e1c6`.

## Verdict

Ready for review. No blockers. Not deployed. Akarsh reviews before merge or deploy. The production change on the next deploy is `assets.html_handling: drop-trailing-slash`. `not_found_handling` is unchanged.

## PR body (draft, not opened)

**Title:** fix(seo): serve MPA directory pages at their no-slash canonicals

**Body:**

Canonicals, the sitemap, and in-page links use `/app`, `/privacy`, and `/terms`. Cloudflare's default HTML handling 307s those directory indexes to the slashed form. `assets.html_handling` is now `drop-trailing-slash`, so the bare paths are the 200s and the slashed forms redirect back.

Vite's MPA server was 404ing those same bare paths (the landing CTA is `href="/app"`). Dev and preview now rewrite the bare path onto the directory index and 307 the slashed form back. Unknown paths are unchanged: Vite 404s, Cloudflare still serves the marketing `index.html`.

No mobile work, no pixel work, no `seo` branch merge, no deploy.

Test plan:

- `pnpm test` — 173 pass
- `pnpm build`
- `node --test tests/rendered-html.test.mjs` — 6 pass
- `wrangler dev`: bare MPA URLs 200, slashed forms 307 to the bare path, unknown path serves the marketing index
- Vite dev and `vite preview`: same 200/307 for the four pages; unknown path 404
