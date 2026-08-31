# Project conventions

- Use `pnpm` for installing dependencies and running scripts. Keep `pnpm-lock.yaml` as the only package-manager lockfile; do not use npm or Yarn in this repository.

## Design system

Tokens live in `packages/viewer-react/src/theme.css`; the shared class patterns
live in `ui` (exported from `@pdfdiff/viewer-react`). Compose those instead of
writing new values — an arbitrary `text-[13px]` or `tracking-[-0.035em]` in a
diff is the thing this section exists to prevent.

- **Colour:** only the semantic tokens (`bg-card`, `text-muted-foreground`,
  `border-border`, `text-primary`, `success`/`destructive`). No raw hex, no
  border opacity variants — a border is `border-border`.
- **Type:** `text-3xs` (10px) and `text-2xs` (11px) for chrome and meta, then
  Tailwind's `xs`/`sm`/`base`/`lg`/`xl`. Nothing else.
- **Tracking:** `tracking-tight` for headings and UI labels, `tracking-tighter`
  for display headlines, `tracking-caps` for uppercase labels. Nothing else.
- **Radius:** `rounded-lg` for controls, `rounded-xl` for cards and dialogs,
  `rounded-full` for pills.
- **The five patterns in `ui`:** `focus` (every focusable thing),
  `caps` (uppercase section label), `card`, `control` (any clickable chrome that
  is not the primary button), `dialog`.
- **Buttons:** app screens use `components/ui/button.tsx`; the viewer package
  cannot import it, so its buttons compose `ui.control` instead.
- **Form controls:** native inputs styled by `.pdfdiff-swatch`,
  `.pdfdiff-range`, and `.pdfdiff-switch` in `theme.css`. No component library.
