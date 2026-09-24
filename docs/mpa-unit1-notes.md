# MPA unit 1

Four Vite HTML inputs. Cloudflare Pages serves a directory `index.html` for the clean URL.

| URL | Source | What loads |
| --- | --- | --- |
| `/` | `index.html` | Static marketing page. Crawlable copy. CTA to `/app`. No React mount. |
| `/privacy` | `privacy/index.html` | Static privacy policy. |
| `/terms` | `terms/index.html` | Static terms of service. |
| `/app` | `app/index.html` | React compare workspace. `main.tsx` mounts `PdfDiffApp`. |

There is no redirect from `/` to `/app`. The landing call to action is the only way into the workspace.

`wrangler.jsonc` still sets `assets.not_found_handling` to `single-page-application`. A path that is not a built file falls back to the marketing `index.html`, not the compare app. `NotFoundPage` is not mounted. The Vite dev server uses `appType: "mpa"`, so unknown paths 404 locally instead of that fallback.

`LegalPage.tsx` is still in the tree and is not imported by `main.tsx`. A later unit can delete it, along with the unused client not-found page, once nothing else needs the copy.
