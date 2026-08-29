# Performance benchmarks

The benchmark commands produce JSON that contains both timing data and
correctness checks. Baselines are intentionally separate from generated runs;
generated reports are ignored by Git.

## Core benchmark

Run the deterministic headless comparison scenarios:

    pnpm bench:core

This writes benchmarks/runs/core.json. To compare it with the checked-in
baseline:

    pnpm run bench:report -- --baseline=benchmarks/baselines/core.json --current=benchmarks/runs/core.json --output=benchmarks/reports/core.json --threshold=35 --fail-on-regression

The default regression threshold is 20 percent. Use a wider threshold when
comparing different machines or runtimes. A benchmark fails if a quality
assertion fails, a scenario is missing, or a measured median exceeds the
baseline by more than the selected threshold.

The core benchmark isolates raster, alignment, and semantic algorithms. It
does not represent PDF.js parsing, canvas rendering, image encoding, or React
viewer work. Those costs are measured by the browser benchmark below.

## Reading results

Use benchmark.scenario durations for end-to-end scenario comparisons. Use
the individual metric summaries to choose the next optimization target.
Parent metrics include child work, so do not add parent and child durations
together.

## Browser benchmark

Run the real app through Chromium:

    pnpm run bench:browser

The browser runner defaults to the contracts fixture pair and writes
benchmarks/runs/browser.json. It measures time from Compare PDFs to a visible
workspace, captures the comparison metric stream, and records browser
long-task entries.

Compare a browser run with the checked-in baseline:

    pnpm run bench:report -- --baseline=benchmarks/baselines/browser.json --current=benchmarks/runs/browser.json --output=benchmarks/reports/browser.json --threshold=35 --fail-on-regression

The runner expects Playwright and a Chromium executable to be available. For
the repository setup, install the browser once:

    pnpm exec playwright install chromium

For an environment with Playwright or Chromium outside the project install,
provide:

    PDFDIFF_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs PDFDIFF_CHROMIUM_PATH=/absolute/path/to/Chromium pnpm run bench:browser

Use url, earlier, newer, runs, warmups, and output arguments to select another
server, fixture pair, run count, or output file. The browser benchmark is
separate from the core baseline because browser, PDF.js, and rendering costs
are not represented by the headless scenarios.
