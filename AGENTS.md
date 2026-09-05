# Project conventions

- Use `pnpm` for installing dependencies and running scripts. Keep `pnpm-lock.yaml` as the only package-manager lockfile; do not use npm or Yarn in this repository.
- Prettier owns formatting (120 columns). Run `pnpm format` before committing, or `pnpm format:check` to see what it would change. Do not hand-wrap code to taste.

## Design system

Tokens live in `packages/viewer-react/src/theme.css`; the shared class patterns
live in `ui` (exported from `@pdfdiff/viewer-react`). Compose those instead of
writing new values — an arbitrary `text-[13px]` or `tracking-[-0.035em]` in a
diff is the thing this section exists to prevent.

- **Colour:** only the semantic tokens (`bg-card`, `text-muted-foreground`,
  `border-border`, `text-primary`, `success`/`destructive`). No raw hex. Tokens
  hold real colours, so `var(--border)` works in plain CSS and the opacity
  modifier works in utilities — `hover:border-foreground/30` and
  `border-primary/60` are how a state or a selection is marked.
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
