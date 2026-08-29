# PDF Diff code review

This review records the maintainability audit completed on 28 August 2026.
The refactor is directionally sound. This pass removed the migration leftovers,
made the package boundaries explicit, and moved the remaining complexity into
focused algorithm and state modules.

## Priority findings

### 1. Finish the package extraction

The old `lib/pdfdiff` implementation overlaps with the new
`@pdfdiff/core` and `@pdfdiff/pdfjs-browser` packages. The old files are not
used by production code; only semantic tests still import compatibility
wrappers. Maintaining both trees makes bug fixes ambiguous.

The old tree has been removed and tests now import the published package entry
points.
If compatibility imports are required later, add a deliberate compatibility
package with its own tests.

### 2. Make the viewer package's styling contract explicit

`@pdfdiff/viewer-react` emits Tailwind utility classes, so its theme variables
and source contract must travel with the package.

The package now ships `theme.css`, exports it, marks it as a side effect, and
documents the Tailwind import. The application consumes that same theme instead
of maintaining a second palette.

### 3. Keep expensive comparison work off the UI's critical path

Alignment, pixel diffing, connected-region detection, and semantic diffing are
synchronous CPU work. Cancellation checks are cooperative, so a large page can
still block the browser until the current pass finishes.

The current cleanup adds event-loop yields between pages and CPU-heavy passes as
a safe intermediate improvement. A worker boundary for comparison orchestration
and transferable raster buffers remains the next measured performance project.

The first measurement layer is now in place: callers can provide an opt-in
metric sink to the core or browser adapter and receive source, render, text,
alignment, visual, semantic, page, and total-comparison timings. Chromium heap
samples are included when the browser exposes them. The sink is absent by
default, so ordinary comparisons do not pay for timing or metric allocation.

### 4. Avoid retaining unnecessary raster and base64 data

The comparison engine still holds full raster results while a comparison is
running, but the app now converts previews to compressed object URLs instead of
base64 data URLs and revokes them when a comparison is discarded. Lazy page
loading or virtualized thumbnails is still the next step for very large PDFs.

### 5. Do not cast a structural signal into a native `AbortSignal`

The core intentionally accepts a small `AbortSignalLike` contract, but the
PDF.js adapter calls native event-listener methods after casting. A caller can
legally pass an object with only `aborted`, which would fail at runtime.

Browser-facing APIs should accept native `AbortSignal`; only pure core
algorithms should use the structural signal type.

## Complexity and structure

The main viewer component previously contained navigation, keyboard handling,
settings, dialogs, the page rail, the toolbar, and the inspector. Those concerns
now live in `useViewerState`, `useViewerKeyboard`, and focused chrome components.
The app shell's upload and loading screens are also separate components.

The pure comparison algorithms remain cohesive, with region traversal, pixel
mask construction, semantic search, and PDF page strategies extracted into
small helpers where it improves testing.

## Dead code and duplication

- The unused `lib/client` helpers and their tests have been removed.
- The unused ChatGPT auth helper and its README section have been removed while
  the app remains anonymous-compatible.
- Unused starter assets and the empty `next.config.ts` placeholder have been
  removed.
- The root `pixelmatch` dependency has been removed; it belongs to
  `@pdfdiff/core`.
- `app/pdfdiff/styles.ts` now contains only upload/loading styles. Viewer styles
  belong to the viewer package.
- Render and region caps are named policy options, and text-change truncation is
  exposed as a count in the inspector.

## Documentation and comments

The viewer and upload screen now share structured help steps/modes/shortcuts;
`HELP.md` remains the long-form guide. “New comparison” now keeps the selected
files, matching the guide, so users can adjust settings and rerun the pair.

Stale starter comments, commented-out configuration, and speculative future
WebGPU notes have been removed. Public API documentation remains, and raster
documentation now clarifies that data is transferable through its backing
`ArrayBuffer`, not that the typed-array object itself is transferable.

## Correctness concern

Metadata currently trusts forwarded host and protocol headers when building the
canonical origin. Use a configured origin or validate forwarded values against
an allowlist before constructing `metadataBase`.

## Implemented cleanup order

1. Record this review and establish package-owned contracts.
2. Remove duplicate and unused source surfaces.
3. Consolidate styles and help content.
4. Fix signal typing, object URL lifecycle, and event-loop responsiveness.
5. Split the app/viewer orchestration and validate with package builds, lint,
   type checks, and tests.
