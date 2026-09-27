# Static hero restore

Branch: `mpa-landing-app`. No deploy, no merge, no mobile (#3), no pixel (#4).

## What was restored

The landing page at `/` shows the comparison demo again. The plain “On your device” card is gone. `index.html` follows `demo*` classes in `app/pdfdiff/styles.ts` and the SVG geometry in `app/pdfdiff/HeroDemo.tsx`: shared drawing, removed ink `#ee4856`, added ink `#10bebe`, unchanged content at opacity 0.4.

`/` does not mount React, `PdfDiffApp`, or `main.tsx`. `/app` still uses `HeroDemo.tsx` as the React source of truth. That component was not changed.

## Default swipe

The static demo opens on swipe, so `.pdfdiff-swipe-top` and `.pdfdiff-swipe-handle` are in the document and the clip animation in `app/globals.css` runs on load. The React demo on `/app` still starts on overlay.

## static-shell cycling

`static-shell.ts` still toggles the theme. It also drives `[data-hero-demo]` when that hook is present. Privacy and terms do not have it, so the controller does nothing there.

- Modes advance overlay → split → swipe → text every 4200ms.
- `prefers-reduced-motion: reduce` skips the timer. The swipe CSS already turns its animation off.
- A tab click selects that mode, updates `aria-pressed`, the count, the caption, and which panel is visible, then stops the timer.

## Tests

- `pnpm test` — 173 pass, 0 fail, 0 skipped, 0 todo. `tests/seo.test.ts` checks `pdfdiff-swipe-top`, `pdfdiff-swipe-handle`, `data-hero-demo`, the ASSY-4471 demo, “Demo comparison views”, the `/app` CTA, `static-shell.ts`, and that `/` still has no `#root` or `main.tsx`.
- `pnpm build` — success, including typecheck. The marketing page and `static-shell` bundle stay separate from the `/app` React bundle.

A Chrome pass against `vite preview` (not part of `pnpm test`) showed the swipe clip running on load, tabs switching panels and stopping the cycle, the timer advancing swipe → text, reduced motion freezing both the CSS and the timer, and `/privacy` loading with no demo.

## Commit

Recorded in the follow-up once this commit’s sha exists.

## Out of scope

- Deploy
- Merge
- Mobile (#3) and pixel (#4)
- Remounting React on `/`
- Changing the React `HeroDemo` on `/app`
