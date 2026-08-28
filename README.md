# PDF Diff

PDF Diff compares two PDF revisions locally in the browser. It renders visual
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
- `pnpm build`: build the packages and the vinext app
- `pnpm test`: build and run the rendered HTML, client helper, and semantic tests
- `pnpm lint`: run ESLint
- `pnpm db:generate`: generate Drizzle migrations when needed

## Included platform shape

The app runs on [vinext](https://github.com/cloudflare/vinext) and keeps the
starter's optional Cloudflare D1/Drizzle support. `.openai/hosting.json`
declares the Sites project configuration; no server-side PDF upload endpoint is
used.

## Repository notes

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
