# Project conventions

- Use `pnpm` for installing dependencies and running scripts. Keep `pnpm-lock.yaml` as the only package-manager lockfile; do not use npm or Yarn in this repository. Node `>=22.13.0`.
- Prettier owns formatting (120 columns). Run `pnpm format` before committing, or `pnpm format:check` to see what it would change. Do not hand-wrap code to taste.

## Layout

Four workspace packages under `packages/` (`pnpm-workspace.yaml` globs `packages/*`),
plus the app shell at the repo root — there is no `src/`.

- `@pdfdiff/core` — headless raster, alignment, region, and semantic text algorithms. No DOM, no PDF.js.
- `@pdfdiff/pdfjs-browser` — PDF.js adapter: loading, rendering, and the raster-diff Web Worker.
- `@pdfdiff/viewer-react` — the React viewer. Also exports `./ui` (the style tables) and `./theme.css`.
- `@pdfdiff/node` — headless comparison for Node plus the `pdfdiff` CLI bin.
- `app/`, `components/`, `lib/`, `main.tsx`, `index.html` — the static Vite product shell.
- `tests/` (`node --test`, TypeScript run through `--experimental-strip-types`), `tools/` (benchmark and accuracy scripts).

Packages build with `tsc` to `dist/`, and each has a `development` export condition
pointing at `src/`, so Vite dev runs sources directly. Anything that consumes a
package from a built artifact needs `pnpm build:packages` first — which is why
`test`, `build`, `accuracy`, and `bench:core` all run it themselves.

`pnpm typecheck` and `pnpm lint` (eslint, ignoring `dist`) are the other two checks.

## Design system

Tokens live in `packages/viewer-react/src/theme.css`; the shared class patterns
live in `ui` (exported from `@pdfdiff/viewer-react/ui`, the subpath — the root
export is the viewer). Compose those instead of writing new values — an
arbitrary `text-[13px]` or `tracking-[-0.035em]` in a diff is the thing this
section exists to prevent.

- **Colour:** only the semantic tokens (`bg-card`, `text-muted-foreground`,
  `border-border`, `text-primary`, `success`/`destructive`). No raw hex. Tokens
  hold real colours, so `var(--border)` works in plain CSS and the opacity
  modifier works in utilities — `hover:border-foreground/30` and
  `border-primary/60` are how a state or a selection is marked.
- **Dark mode** is the `.dark` class on the root (a `@custom-variant`), not a
  media query, so the toggle can win.
- **Type:** `text-3xs` (10px) and `text-2xs` (11px) for chrome and meta, then
  Tailwind's `xs`/`sm`/`base`/`lg`/`xl`. Nothing else.
- **Line height:** Tailwind's `leading-*` utilities, plus `leading-display`
  (1.05) for the two display headlines. No `leading-[…]`.
- **Tracking:** `tracking-tight` for headings and UI labels, `tracking-tighter`
  for display headlines, `tracking-caps` for uppercase labels. Nothing else.
- **Radius:** `rounded-lg` for controls, `rounded-xl` for cards and dialogs,
  `rounded-full` for pills.
- **Breakpoints:** mobile-first. The narrow layout is the base and `sm` (560px),
  `md` (680px), `lg` (820px), `xl` (980px), `2xl` (1200px) widen it. Never a
  `max-[…]:` variant, and never a width outside those five — they are
  `--breakpoint-*` in `theme.css`.
- **The five patterns in `ui`:** `focus` (every focusable thing),
  `caps` (uppercase section label), `card`, `control` (any clickable chrome that
  is not the primary button), `dialog`.
- **Buttons:** app screens use `components/ui/button.tsx`; the viewer package
  cannot import it, so its buttons compose `ui.control` instead.
- **Form controls:** native inputs styled by `.pdfdiff-swatch`,
  `.pdfdiff-range`, and `.pdfdiff-switch` in `theme.css`. No component library.
- **Composing:** `className={cx(styles.thing, active && styles.thingOn)}`. `cx`
  is tailwind-merge, so later arguments win and conflicts inside one string are
  resolved — several styles layer `ui.control` under their own background and
  depend on that.
