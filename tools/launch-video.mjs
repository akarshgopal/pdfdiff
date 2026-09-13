// Captures the launch video from the REAL comparison workspace, stripped down and
// framed to match the landing page's hero demo, then the end card.
//
// Framing: the workspace is reduced to the hero demo's anatomy (file chips -> page
// stage -> mode tabs -> count bar) and pinned to ONE fixed 1580x900 card on the app's
// dot-grid. The card never moves between beats, so only its contents change.
//
// Transitions: beats are hard cuts (plain concat). No wipes — a wipe reads as the
// product's own Slider gesture. Only the end card arrives, via a dissolve.
//
// Usage: pnpm dev, then `node tools/launch-video.mjs`.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, renameSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.PDFDIFF_URL ?? "http://localhost:5173/";
const out = process.env.PDFDIFF_VIDEO_OUT ?? "launch-video";
const music = process.env.PDFDIFF_MUSIC ?? "tools/fassounds-upbeat-advertising-funk-412226.mp3";
// 7.1s is the measured drop: >12kHz energy sits at ~0.05 through the intro, then holds
// 0.13-0.25 from 7.1s. Back it off by the intro length so the riser (a sweep through
// 1.4-4.2kHz from ~3-6s) plays under the entrance and the drop lands on the settle.
const DROP_AT = 7.1;
const size = { width: 1920, height: 1080 };
const CARD = { w: 1580, h: 900 };

// Opening treatment. "rise": the card fades up out of a slight push-in. "bookend":
// the pdfdiff lockup holds, then contracts as the card takes its place, so the video
// opens and closes in the same visual language.
const INTRO = process.env.PDFDIFF_INTRO ?? "rise";
const INTRO_SECONDS = INTRO === "bookend" ? 1.1 : 0.6;
// Must come after INTRO_SECONDS: const is hoisted but sits in the temporal dead zone,
// so reading it any earlier throws at module load (node --check will not catch that).
const musicStart = Number(process.env.PDFDIFF_MUSIC_START ?? Math.max(0, DROP_AT - INTRO_SECONDS));

// One document per mode, each chosen for the mode it shows best. Ordered so the two
// datasheet beats sit together — only two document changes in the whole video.
// Every beat sits at >=150%, where qualityForZoom() switches to the scale-3 render;
// below that the viewer serves a visibly aliased raster.
const BEATS = [
  // Opens in Split so the two revisions can slide together and superimpose before the
  // computed diff resolves — "A and B become the diff" rather than a static result.
  { id: "overlay", sample: "CAD", key: "2", zoom: 2, hold: 2.1, act: convergeToOverlay },
  { id: "split", sample: "Datasheet", key: "2", zoom: 2, hold: 1.3 },
  { id: "swipe", sample: "Datasheet", key: "3", zoom: 3, hold: 1.7, prepare: parkSwipe, act: sweep },
  { id: "text", sample: "Contract", key: "4", zoom: 2, hold: 1.3 },
];
const MODES_SECONDS = BEATS.reduce((n, b) => n + b.hold, 0) + INTRO_SECONDS;
const END_SECONDS = 2.4;
const END_TRANSITION = "fade";
const XFADE = 0.3;
const SWEEP_MS = 1200;
const work = mkdtempSync(join(tmpdir(), "pdfdiff-video-"));

const contextOptions = {
  viewport: size,
  // 2x, not 3x: a 5760x3240 backing store outruns Chrome's screencast and the
  // recorded frames lag the live DOM.
  deviceScaleFactor: 2,
  colorScheme: "dark",
};

/** Recording-only: the product divider is 2px, invisible at video scale. */
const FILM_CSS = `
  [aria-label="Swipe position"] > span { width: 5px !important; box-shadow: 0 0 14px rgba(0,0,0,.55); }
`;

/** Strip the workspace to the hero demo's anatomy and pin it to a fixed card. */
function FRAME({ card, intro }) {
  const root = document.querySelector('section[aria-label="PDF comparison workspace"]');
  if (!root) throw new Error("workspace not found");
  const hide = (el) => {
    if (el) el.style.setProperty("display", "none", "important");
  };
  const canvas = root.querySelector('section[aria-label="PDF comparison"]');
  const grid = canvas && canvas.parentElement;

  // The rail's track is declared on the grid (lg:grid-cols-[124px_minmax(0,1fr)]).
  // Hiding the rail alone drops the canvas INTO that 124px track, so collapse the
  // template to a single column as well.
  if (grid) {
    grid.style.setProperty("grid-template-columns", "minmax(0,1fr)", "important");
    for (const c of [...grid.children]) if (c !== canvas) hide(c);
  }

  hide(document.querySelector('[aria-label="Page navigation"]'));

  const modes = document.querySelector('[role="toolbar"][aria-label="View mode"]');
  let row = modes;
  while (row && row.parentElement && !row.parentElement.matches('section[aria-label="PDF comparison"]')) {
    row = row.parentElement;
  }
  if (row) for (const c of [...row.children]) if (c !== modes && !c.contains(modes)) hide(c);

  const header = root.querySelector("header");
  if (header) {
    const keep = new Set([
      header.querySelector('[aria-label="Compared documents"]'),
      header.querySelector('[aria-label="Comparison summary"]'),
    ]);
    for (const c of [...header.children]) if (!keep.has(c)) hide(c);
    header.style.justifyContent = "flex-start";
    header.style.gap = "20px";
  }

  const shade = document.createElement("div");
  shade.id = "film-shade";
  shade.style.cssText =
    "position:fixed;inset:0;z-index:99998;background:hsl(240 10% 4%);" +
    "background-image:radial-gradient(hsl(240 6% 12%) 1.5px,transparent 1.5px);background-size:32px 32px;";
  document.body.appendChild(shade);

  root.style.cssText +=
    `;position:fixed;left:50%;top:50%;width:${card.w}px;height:${card.h}px;` +
    "transform:translate(-50%,-50%);border-radius:18px;overflow:hidden;" +
    "border:1px solid hsl(240 4% 16%);box-shadow:0 30px 90px rgba(0,0,0,.65);z-index:99999;";

  // Intro start state. Everything before the mark is off-camera, so the card simply
  // waits here, already composed, until the intro plays it in.
  if (intro) {
    root.style.opacity = "0";
    root.style.transform = `translate(-50%,-50%) scale(${intro === "bookend" ? 0.94 : 1.06})`;
    root.id = "film-card";
  }
  if (intro === "bookend") {
    const lock = document.createElement("div");
    lock.id = "film-lockup";
    lock.style.cssText =
      "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(1);z-index:100000;" +
      "display:flex;align-items:center;gap:22px;color:hsl(0 0% 98%);" +
      "font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-weight:600;" +
      "font-size:82px;letter-spacing:-0.01em;opacity:1;";
    lock.innerHTML =
      '<svg width="104" height="104" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"' +
      ' style="border-radius:24px;display:block">' +
      '<rect width="64" height="64" rx="15" fill="#2563EB"/>' +
      '<path d="M32 18.5A13.5 13.5 0 0 0 32 45.5V18.5Z" fill="#FFFFFF"/>' +
      '<circle cx="32" cy="32" r="13.5" stroke="#FFFFFF" stroke-width="3.5"/></svg><span>pdfdiff</span>';
    document.body.appendChild(lock);
  }

  const cb = canvas.getBoundingClientRect();
  return { canvas: `${Math.round(cb.width)}x${Math.round(cb.height)}` };
}

/**
 * Slides the two Split panes together and resolves into the computed Overlay.
 * The panes carry an opaque bg-background, so without the opacity ramp the top one
 * simply occludes the other — it has to go translucent to actually superimpose.
 * Split panes are 760x587 and the Overlay page is 818x632, so the ~8% size change is
 * masked by dipping the canvas across the mode swap.
 */
async function convergeToOverlay(page) {
  await page.evaluate(() => {
    const panes = [...document.querySelectorAll('section[aria-label="PDF comparison"] img')]
      .map((i) => ({ el: i.parentElement, r: i.getBoundingClientRect() }))
      .filter((x) => x.r.width > 200)
      .sort((a, b) => a.r.x - b.r.x);
    if (panes.length < 2) return;
    const centre = (panes[0].r.x + panes[1].r.x + panes[1].r.width) / 2;
    panes.forEach((p, i) => {
      const d = centre - (p.r.x + p.r.width / 2);
      p.el.style.transition = "transform 760ms cubic-bezier(.4,0,.2,1), opacity 760ms ease";
      p.el.style.transform = `translateX(${d.toFixed(1)}px)`;
      p.el.style.opacity = "0.55";
      if (i === 1) p.el.style.mixBlendMode = "screen";
    });
  });
  // Let the superimposition actually play and be seen.
  await page.waitForTimeout(780);

  // Mask the ~8% size change with the SHORTEST possible dip. An earlier version dipped
  // to 0 and then held it across a 520ms wait for the swap plus a 240ms fade-up — ~0.9s
  // of blank canvas punched through the middle of the move, hiding the very thing the
  // converge exists to show. A visible size pop is far cheaper than a black hole, so the
  // dip only partly darkens, and the mode swap fires immediately.
  const canvasSel = '[aria-label^="Document canvas"]';
  const dim = async (value, ms) =>
    page.evaluate(
      ([sel, v, t]) => {
        const c = document.querySelector(sel) || document.querySelector('section[aria-label="PDF comparison"]');
        c.style.transition = `opacity ${t}ms ease`;
        c.style.opacity = String(v);
      },
      [canvasSel, value, ms],
    );

  await dim(0.35, 110);
  await page.keyboard.press("1");
  await page.waitForTimeout(130);
  await dim(1, 180);
  process.stdout.write("[converge] ");
  await page.waitForTimeout(520);
}

/** Plays the opening. Runs after the mark, so the whole move is inside the clip. */
async function playIntro(page, intro) {
  await page.evaluate((mode) => {
    const card = document.getElementById("film-card");
    const lock = document.getElementById("film-lockup");
    if (!card) return;
    const ease = "cubic-bezier(.2,.7,.25,1)";
    if (mode === "bookend") {
      // Hold the lockup a beat, then trade it for the card.
      setTimeout(() => {
        lock.style.transition = `opacity 420ms ${ease}, transform 620ms ${ease}`;
        lock.style.opacity = "0";
        lock.style.transform = "translate(-50%,-50%) scale(0.82)";
        card.style.transition = `opacity 520ms ${ease}, transform 720ms ${ease}`;
        card.style.opacity = "1";
        card.style.transform = "translate(-50%,-50%) scale(1)";
      }, 380);
    } else {
      card.style.transition = `opacity 420ms ${ease}, transform 620ms ${ease}`;
      card.style.opacity = "1";
      card.style.transform = "translate(-50%,-50%) scale(1)";
    }
  }, intro);
}

async function swipeGeometry(page) {
  const handle = page.getByRole("slider", { name: "Swipe position" });
  await handle.waitFor({ state: "visible" });
  const box = await handle.boundingBox();
  if (!box) throw new Error("swipe handle has no box");
  // Measure the swipe wrap, not the workspace: the component maps pointer x across the
  // rendered page, so stage-relative targets clamp to 0/100 and the sweep sits dead.
  const wrap = await handle.locator("xpath=..").boundingBox();
  if (!wrap) throw new Error("swipe wrap has no box");
  // Clamp into the visible band — past ~150% the page is taller than the card and the
  // wrap's centre falls below the fold, where a drag lands off-screen silently.
  const y = Math.min(Math.max(wrap.y + 40, 140), size.height - 140);
  return {
    handle,
    y,
    grab: box.x + box.width / 2,
    from: wrap.x + wrap.width * 0.08,
    to: wrap.x + wrap.width * 0.92,
  };
}

async function parkSwipe(page) {
  const { y, grab, from } = await swipeGeometry(page);
  await page.mouse.move(grab, y);
  await page.mouse.down();
  await page.mouse.move(from, y);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function sweep(page) {
  const { handle, y, from, to } = await swipeGeometry(page);
  const startValue = await handle.getAttribute("aria-valuenow");
  await page.mouse.move(from, y);
  await page.mouse.down();
  // Time-driven, not step-driven: a mouse.move round-trip costs far more than a fixed
  // sleep, so pacing off the clock is what actually yields the intended sweep.
  const started = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - started) / SWEEP_MS);
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(from + (to - from) * eased, y);
    if (t >= 1) break;
  }
  await page.mouse.up();
  process.stdout.write(`[swipe ${startValue} -> ${await handle.getAttribute("aria-valuenow")}] `);
}

async function capture(browser, beat) {
  const dir = join(work, beat.id);
  const t0 = Date.now();
  const context = await browser.newContext({ ...contextOptions, recordVideo: { dir, size } });
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: beat.sample }).click();

  const ws = page.locator('section[aria-label="PDF comparison workspace"]');
  await ws.waitFor({ state: "visible" });
  await ws.locator("img").first().waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");
  // The comparison streams pages in the background; until it lands on the summary,
  // keystrokes are swallowed and the progress bar sits in frame.
  await page
    .getByText(/pages? changed|Text comparison unavailable/)
    .first()
    .waitFor({ state: "visible", timeout: 180_000 })
    .catch(() => {});
  await page.waitForTimeout(500);

  await page.addStyleTag({ content: FILM_CSS });
  // Only the opening beat carries an intro; the rest cut in already composed.
  const intro = beat.id === BEATS[0].id ? INTRO : null;
  const geom = await page.evaluate(FRAME, { card: CARD, intro });
  process.stdout.write(`[canvas ${geom.canvas}]${intro ? ` [intro ${intro}]` : ""} `);
  await page.waitForTimeout(800); // let the card settle before zooming into it

  await page.keyboard.press(beat.key);
  await page.waitForTimeout(600);
  // Text mode alone adds a filter row, and it only exists once that mode is active —
  // hiding it inside FRAME (which runs earlier) matched nothing. Every beat's chrome
  // has to be identical or the odd one out reads as a jump.
  await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Text change filter"]');
    if (el) el.style.setProperty("display", "none", "important");
  });
  for (let i = 0; i < (beat.zoom ?? 0); i += 1) {
    await page.keyboard.press("+");
    await page.waitForTimeout(450);
  }
  // >=150% crosses into the "high" tier, which re-renders the page from scratch.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1900);
  if (beat.prepare) await beat.prepare(page);

  const mark = (Date.now() - t0) / 1000;
  if (intro) {
    await playIntro(page, intro);
    await page.waitForTimeout(INTRO_SECONDS * 1000);
  }
  if (beat.act) await beat.act(page);
  await page.waitForTimeout(beat.act ? 300 : beat.hold * 1000);
  await page.waitForTimeout(200);

  await context.close();
  const file = readdirSync(dir).find((f) => f.endsWith(".webm"));
  if (!file) throw new Error(`no video captured for ${beat.id}`);
  const raw = join(dir, `${beat.id}-raw.webm`);
  renameSync(join(dir, file), raw);
  return { raw, mark };
}

/** Mode chips, in the app's own toolbar order. */
const MODE_ICONS = {
  overlay: '<rect x="3" y="3" width="13" height="13" rx="2"/><rect x="8" y="8" width="13" height="13" rx="2"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  slider: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 2v20"/><path d="M8 12h1m6 0h1"/>',
  text: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h13"/>',
};
const MODES = [
  ["overlay", "Pixel by pixel"],
  ["split", "Side by side"],
  ["slider", "Slider"],
  ["text", "Text diff"],
];

function chip([icon, label], i) {
  const delay = 900 + i * 100;
  return `<div class="chip" style="animation-delay:${delay}ms">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">${MODE_ICONS[icon]}</svg>
    <span>${label}</span>
  </div>`;
}

const LOCKUP = `<div class="lockup">
  <svg class="mark" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" rx="15" fill="#2563EB"/>
    <path d="M32 18.5A13.5 13.5 0 0 0 32 45.5V18.5Z" fill="#FFFFFF"/>
    <circle cx="32" cy="32" r="13.5" stroke="#FFFFFF" stroke-width="3.5"/>
  </svg>
  <span class="word">pdfdiff</span>
</div>
<h1>Compare PDFs.<br><em class="accent">See what changed.</em></h1>
<p class="lead">Fully private.</p>`;

const END_CARD_HTML = `<!doctype html>
<html class="dark"><head><meta charset="utf-8"><style>
  @font-face {
    font-family: Inter; font-style: normal; font-weight: 400 700; font-display: block;
    src: url("/fonts/inter-latin.woff2") format("woff2");
  }
  :root {
    --background: hsl(240 10% 4%); --foreground: hsl(0 0% 98%); --card: hsl(240 6% 7%);
    --primary: hsl(217 91% 60%); --muted-foreground: hsl(240 5% 65%);
    --border: hsl(240 4% 16%); --stage-dot: hsl(240 6% 12%);
    --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1920px; height: 1080px; overflow: hidden;
    background: var(--background); color: var(--foreground);
    font-family: var(--font-sans); -webkit-font-smoothing: antialiased;
    background-image: radial-gradient(var(--stage-dot) 1.5px, transparent 1.5px);
    background-size: 32px 32px;
    display: grid; place-items: center;
  }
  .stack { display: flex; flex-direction: column; align-items: flex-start; gap: 54px; }
  .card { position: relative; width: 1180px; height: 420px; }
  .layer {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    justify-content: center; gap: 30px; padding-left: 8px;
  }
  /* Held until .go is added after the mark. Running these on load meant fonts.ready
     burned most of the 980ms before recording began, so only the divider's tail was
     captured and the white->blue change had already finished off-camera. */
  .top { clip-path: inset(0 100% 0 0); }
  .go .top { animation: reveal 1000ms cubic-bezier(.4,0,.2,1) forwards; }
  .divider {
    position: absolute; top: -40px; bottom: -40px; left: 0; width: 5px;
    background: var(--primary); box-shadow: 0 0 24px hsl(217 91% 60% / .55);
    opacity: 0;
  }
  .go .divider { animation: slide 1000ms cubic-bezier(.4,0,.2,1) forwards; }
  @keyframes reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  @keyframes slide {
    0% { left: 0; opacity: 1; }
    85% { opacity: 1; }
    100% { left: 100%; opacity: 0; }
  }
  .lockup { display: flex; align-items: center; gap: 20px; }
  .mark { width: 76px; height: 76px; border-radius: 18px; display: block; }
  .word { font-size: 60px; font-weight: 600; letter-spacing: -0.01em; }
  h1 { font-size: 104px; font-weight: 600; line-height: 1.05; letter-spacing: -0.025em; }
  .accent { color: var(--primary); font-style: normal; }
  .lead { font-size: 38px; color: var(--muted-foreground); letter-spacing: -0.01em; }
  .base h1 .accent { color: var(--foreground); }
  .base .mark { opacity: .28; filter: grayscale(1); }
  .base .lead { opacity: .5; }
  .modes { display: flex; gap: 16px; padding-left: 8px; }
  .chip {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 26px; border: 1px solid var(--border); border-radius: 999px;
    background: var(--card); font-size: 27px; font-weight: 500; white-space: nowrap;
    opacity: 0; transform: translateY(16px);
  }
  .go .chip { animation: chipIn 460ms cubic-bezier(.2,.7,.3,1) forwards; }
  .chip svg { width: 27px; height: 27px; color: var(--primary); flex: none; }
  @keyframes chipIn { to { opacity: 1; transform: none; } }
</style></head><body>
  <div class="stack">
    <div class="card">
      <div class="layer base">${LOCKUP}</div>
      <div class="layer top">${LOCKUP}</div>
      <div class="divider"></div>
    </div>
    <div class="modes">${MODES.map(chip).join("")}</div>
  </div>
</body></html>`;

async function captureEndCard(browser) {
  const dir = join(work, "end");
  const t0 = Date.now();
  const context = await browser.newContext({ ...contextOptions, recordVideo: { dir, size } });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.setContent(END_CARD_HTML, { waitUntil: "load" });
  // Resolve to a boolean: document.fonts.ready yields a FontFaceSet, which Playwright
  // cannot serialize back across the bridge.
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(200);
  const mark = (Date.now() - t0) / 1000;
  // Start the reveal only now, so the whole white -> blue sweep is inside the clip.
  await page.evaluate(() => document.body.classList.add("go"));
  await page.waitForTimeout(END_SECONDS * 1000 + 200);
  await context.close();
  const file = readdirSync(dir).find((f) => f.endsWith(".webm"));
  if (!file) throw new Error("no end card captured");
  const raw = join(dir, "end-raw.webm");
  renameSync(join(dir, file), raw);
  return { raw, mark };
}

// Accurate forward seek (-ss after -i). Seeking from the end is unreliable on
// Playwright's variable-frame-rate webm.
function trim(raw, mark, seconds, dest) {
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    raw,
    "-ss",
    String(mark),
    "-t",
    String(seconds),
    "-vf",
    `fps=60,scale=${size.width}:${size.height}:flags=lanczos,setsar=1`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "15",
    "-preset",
    "slow",
    dest,
  ]);
  return dest;
}

const browser = await chromium.launch();
const clips = [];
for (const beat of BEATS) {
  process.stdout.write(`capturing ${beat.id} (${beat.sample})... `);
  const { raw, mark } = await capture(browser, beat);
  // The opening clip also holds the intro, which was recorded after the mark.
  const extra = beat.id === BEATS[0].id ? INTRO_SECONDS : 0;
  clips.push(trim(raw, mark, beat.hold + extra, join(work, `${beat.id}.mp4`)));
  console.log(`ok (mark ${mark.toFixed(2)}s)`);
}
process.stdout.write("capturing end card... ");
const end = await captureEndCard(browser);
const endClip = trim(end.raw, end.mark, END_SECONDS, join(work, "end.mp4"));
console.log(`ok (mark ${end.mark.toFixed(2)}s)`);
await browser.close();

// Beats join as hard cuts (concat). Only the end card dissolves in.
const list = join(work, "clips.txt");
writeFileSync(list, clips.map((c) => `file '${c}'`).join("\n") + "\n");
const modesClip = join(work, "modes.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", modesClip]);

const total = Number((MODES_SECONDS + END_SECONDS - XFADE).toFixed(3));
const silent = join(work, "silent.mp4");
execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-i",
  modesClip,
  "-i",
  endClip,
  "-filter_complex",
  `[0:v][1:v]xfade=transition=${END_TRANSITION}:duration=${XFADE}:offset=${(MODES_SECONDS - XFADE).toFixed(3)}[v]`,
  "-map",
  "[v]",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-crf",
  "15",
  "-preset",
  "slow",
  silent,
]);
console.log(`stitched ${clips.length} beats (hard cuts) + end card (${END_TRANSITION}) -> ${total}s`);

if (existsSync(music)) {
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    silent,
    "-ss",
    String(musicStart),
    "-t",
    String(total),
    "-i",
    music,
    "-filter_complex",
    `[1:a]afade=t=in:st=0:d=0.04,afade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8[a]`,
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    `${out}.mp4`,
  ]);
  console.log(`scored with ${music} from ${musicStart}s`);
} else {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-c", "copy", `${out}.mp4`]);
}

execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-i",
  silent,
  "-c:v",
  "libvpx-vp9",
  "-crf",
  "30",
  "-b:v",
  "0",
  "-an",
  `${out}.webm`,
]);
execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-i",
  silent,
  "-vf",
  "fps=15,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];" +
    "[b][p]paletteuse=dither=bayer:bayer_scale=3",
  `${out}.gif`,
]);

rmSync(work, { recursive: true, force: true });
console.log(`\nwrote ${out}.mp4, ${out}.webm, ${out}.gif`);
