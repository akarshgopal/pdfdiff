/**
 * Regenerates the landing page screenshots in public/shots.
 *
 * The shots are of the real workspace driven by Playwright over a built site,
 * so they cannot drift from the product without this script noticing. Each
 * view is captured against the fixture pair that shows it off best, in both
 * themes, then cropped to trim the empty stage below the page and encoded as
 * WebP.
 *
 * Usage: pnpm run build && pnpm run start & then
 *   node tools/capture-screenshots.mjs --url=http://localhost:4173/
 *
 * Requires ImageMagick (`magick`) and `cwebp` on PATH for the encode step;
 * pass --skip-encode to stop after the PNGs.
 */
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const FIXTURES = "examples/pdf-fixtures";

/** Keep the captions in app/pdfdiff/landing-content.ts in step with these pairs. */
const SHOTS = [
  { view: "overlay", label: "Overlay", earlier: `${FIXTURES}/cad/wheel-hub-rev-a.pdf`, newer: `${FIXTURES}/cad/wheel-hub-rev-b.pdf`, page: 0 },
  { view: "split", label: "Split", earlier: `${FIXTURES}/datasheets/ti-sn74hc595-rev-i.pdf`, newer: `${FIXTURES}/datasheets/ti-sn74hc595-rev-j.pdf`, page: 8 },
  { view: "swipe", label: "Swipe", earlier: `${FIXTURES}/pcb/olimexino-stm32-rev-a.pdf`, newer: `${FIXTURES}/pcb/olimexino-stm32-rev-b.pdf`, page: 0 },
  { view: "text", label: "Text", earlier: `${FIXTURES}/contracts/work-order-original.pdf`, newer: `${FIXTURES}/contracts/work-order-amended.pdf`, page: 0 },
];

const THEMES = ["light", "dark"];
const VIEWPORT = { width: 1440, height: 900 };
/** Trimming the bottom of the stage keeps the frame from looking half empty. */
const CROP = "2880x1680+0+0";
const OUTPUT_WIDTH = 2000;

function argument(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const url = argument("url", "http://localhost:4173/");
const outputDirectory = resolve(process.cwd(), argument("out", "public/shots"));
const workingDirectory = resolve(outputDirectory, ".png");
const skipEncode = process.argv.includes("--skip-encode");

function run(command, args, stdin) {
  return new Promise((fulfil, fail) => {
    const child = spawn(command, args, { stdio: [stdin ? "pipe" : "ignore", "pipe", "inherit"] });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.on("error", (error) => fail(new Error(`${command} is not available: ${error.message}`)));
    child.on("close", (code) => (code === 0 ? fulfil(Buffer.concat(chunks)) : fail(new Error(`${command} exited with ${code}`))));
    if (stdin) child.stdin.end(stdin);
  });
}

async function encode(source, destination) {
  const cropped = await run("magick", [source, "-crop", CROP, "+repage", "-resize", `${OUTPUT_WIDTH}x`, "-strip", "png:-"]);
  await run("cwebp", ["-quiet", "-q", "82", "-m", "6", "-o", destination, "--", "-"], cropped);
}

async function captureShot(browser, shot, theme) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: theme });
  await context.addInitScript((value) => {
    try {
      window.localStorage.setItem("pdfdiff-theme", value);
    } catch {
      // The colorScheme override still applies when storage is blocked.
    }
  }, theme);
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator('input[aria-label^="Choose one or two PDFs for earlier"]').setInputFiles(resolve(process.cwd(), shot.earlier));
    await page.locator('input[aria-label^="Choose one or two PDFs for newer"]').setInputFiles(resolve(process.cwd(), shot.newer));
    await page.getByRole("button", { name: /^Compare/ }).click();

    const workspace = page.locator('section[aria-label="PDF comparison workspace"]');
    await workspace.waitFor({ state: "visible", timeout: 60_000 });
    await workspace.locator("img").first().waitFor({ state: "visible", timeout: 60_000 });
    await page.getByText(/Comparing pages/).first().waitFor({ state: "detached", timeout: 300_000 }).catch(() => {
      // A comparison that finishes before the indicator renders never detaches.
    });
    await page.waitForTimeout(2_000);

    if (shot.page > 0) {
      await page.locator('aside[aria-label="Pages"] button').nth(shot.page).click();
      await page.waitForTimeout(1_500);
    }
    await page.getByRole("button", { name: shot.label, exact: true }).first().click();
    await page.waitForTimeout(1_200);

    const png = `${workingDirectory}/${shot.view}-${theme}.png`;
    await page.screenshot({ path: png });
    return png;
  } finally {
    await context.close();
  }
}

await mkdir(workingDirectory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});

try {
  for (const shot of SHOTS) {
    for (const theme of THEMES) {
      const png = await captureShot(browser, shot, theme);
      if (skipEncode) {
        console.log(`captured ${png}`);
        continue;
      }
      const webp = `${outputDirectory}/${shot.view}-${theme}.webp`;
      await encode(png, webp);
      console.log(`wrote ${webp}`);
    }
  }
} finally {
  await browser.close();
  if (!skipEncode) await rm(workingDirectory, { recursive: true, force: true });
}
