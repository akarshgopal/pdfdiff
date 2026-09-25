# MPA unit 2

Branch: `mpa-landing-app`. Smallest change. No framework, no mobile (#3), no pixel (#4), no `seo` merge, no deploy.

## Deleted

- `app/pdfdiff/LegalPage.tsx` and `app/pdfdiff/NotFoundPage.tsx`. Search before delete: no product module imported them (`main.tsx` mounts `PdfDiffApp` only). Mentions remain in `docs/mpa-unit1-notes.md` and `.grok-prompts/` (historical).
- Dead `legal*` keys in `app/pdfdiff/styles.ts`, plus the “Legal pages: same shell, narrower measure.” comment. Those classes were only used by the two deleted pages. Static `privacy/index.html` and `terms/index.html` already own the legal copy.
- `routes.ts` still maps unknown paths to `"not-found"` for meta helpers and tests. Cloudflare `assets.not_found_handling` is still `single-page-application`, so an unknown path falls back to the marketing `index.html`. The Vite dev server (`appType: "mpa"`) 404s unknown paths locally. The route helper stays.

## Chrome

Landing, privacy, and terms headers and footers were already byte-identical (wordmark → `/`, GitHub, theme toggle, footer Terms / Privacy / CLI / Contact). Left the duplicated minimal HTML and shared `static-shell.ts` theme script as they were. No Astro, SSI, or HTML partial pipeline.

`tests/seo.test.ts` asserts the three source files share the same first `<header>…</header>` and `<footer>…</footer>`. Privacy and terms also have a second, page-specific article `<header>`; that one is not the site chrome.

## `/app` wordmark

`UploadScreen` and `LoadingScreen` already render `<AppHeader href="/" />`, so the workspace wordmark links home. `ViewerChrome` keeps a non-linked mark in the dense viewer bar. Not changed, and `@pdfdiff/viewer-react` was not touched.

## Checks

All green:

- `pnpm exec prettier --write` on the touched files (`app/pdfdiff/styles.ts`, `tests/seo.test.ts`, this note), then `prettier --check` on those files.
- `pnpm test` — 172 pass.
- `pnpm build` — emits `dist/index.html`, `dist/privacy/index.html`, `dist/terms/index.html`, and `dist/app/index.html`.
- `node --test tests/rendered-html.test.mjs` — 6 pass. Same assertion `pnpm test:dist` runs after its own build.

## Leftover (units 3–4)

- Unit 3: meta / routing / sitemap / wrangler consistency only, if anything is still off. Sitemap already lists `/app`. Do not start a rewrite. Unknown-path behavior is the SPA fallback above, not a React 404 page.
- Unit 4 / issue #4: pixel polish. Issue #3: mobile. Both still out of scope.
- Do not merge `seo`. Do not deploy.
