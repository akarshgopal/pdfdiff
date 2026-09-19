// Captures the CLI launch video: an agent typing real `@pdfdiff/cli` commands into a
// terminal card, each one answering with the REAL output — overlay PNG, JSON report,
// text report — then the pdfdiff end card.
//
// Framing matches tools/launch-video.mjs deliberately: the same 1580x900 card on the
// same dot-grid, the same lockup, the same score. The app video shows the product;
// this one shows the same comparison with no browser in it.
//
// Every byte on screen is produced by running the CLI at record time (runCli below).
// Nothing is typed by hand into the HTML — a stale fake report is the one thing a
// launch video cannot afford.
//
// Usage: `node tools/cli-video.mjs` (needs ffmpeg; builds the CLI if missing).
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, renameSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = process.env.PDFDIFF_VIDEO_OUT ?? "cli-video";
const music = process.env.PDFDIFF_MUSIC ?? "tools/fassounds-upbeat-advertising-funk-412226.mp3";
// Same measured drop as the app video; see launch-video.mjs.
const DROP_AT = 7.1;
const INTRO_SECONDS = 1.1;
const END_SECONDS = 2.6;
const XFADE = 0.3;
const musicStart = Number(process.env.PDFDIFF_MUSIC_START ?? Math.max(0, DROP_AT - INTRO_SECONDS));

const size = { width: 1920, height: 1080 };
const CARD = { w: 1580, h: 900 };
const FIXTURES = "examples/pdf-fixtures";
const CLI = "packages/pdfdiff/dist/cli.js";
const work = mkdtempSync(join(tmpdir(), "pdfdiff-cli-video-"));

const contextOptions = { viewport: size, deviceScaleFactor: 2, colorScheme: "dark" };

/** Run the real CLI and hand back what a terminal would have shown. */
function runCli(args) {
  process.stdout.write(`$ pdfdiff ${args.join(" ")}\n`);
  const stdout = execFileSync("node", [CLI, ...args, "--quiet"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return stdout.replace(/\s+$/, "");
}

/** Keep a long report to what fits the card, with the tail marked rather than cropped. */
function clamp(text, lines) {
  const all = text.split("\n");
  if (all.length <= lines) return all;
  const rest = all.length - lines;
  return [...all.slice(0, lines), `… ${rest} more line${rest === 1 ? "" : "s"}`];
}

function dataUri(file) {
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

const cad = `${FIXTURES}/cad/wheel-hub-rev-a.pdf`;
const cadB = `${FIXTURES}/cad/wheel-hub-rev-b.pdf`;
const sheet = `${FIXTURES}/datasheets/ti-sn74lv126a-rev-i.pdf`;
const sheetB = `${FIXTURES}/datasheets/ti-sn74lv126a-rev-j.pdf`;
const order = `${FIXTURES}/contracts/work-order-original.pdf`;
const orderB = `${FIXTURES}/contracts/work-order-amended.pdf`;

if (!existsSync(CLI)) execFileSync("node", ["tools/ensure-cli-built.mjs"], { stdio: "inherit" });

const images = join(work, "imgs");
const visual = runCli([cad, cadB, "--images", images]);
// Sorted: readdir order is filesystem-dependent, so an unsorted pick is not reproducible.
const shots = (existsSync(images) ? readdirSync(images) : []).filter((f) => f.endsWith(".png")).sort();
if (!shots.length) throw new Error(`no overlay written for ${cad} -> ${cadB}; pick a pair with a visual change`);
const overlay = join(images, shots[0]);

// Re-serialised rather than sliced out of the text, so the JSON on screen actually parses.
const json = runCli([sheet, sheetB, "--report", "json"]);
const totals = JSON.stringify({ totals: JSON.parse(json).totals }, null, 2);
const text = runCli([order, orderB, "--text-only"]);

/**
 * One continuous take. A terminal already cuts itself — each prompt is the edit — so
 * unlike the app video there are no beats to stitch, only this clip and the end card.
 */
const BEATS = [
  {
    cmd: "npx @pdfdiff/cli wheel-hub-rev-a.pdf wheel-hub-rev-b.pdf --images diff/",
    lines: clamp(visual, 8),
    image: dataUri(overlay),
    hold: 2.4,
  },
  {
    cmd: "npx @pdfdiff/cli rev-i.pdf rev-j.pdf --report json --fail-on-change",
    // Unclamped: taller than the card, so it scrolls and ends on the closing braces.
    lines: totals.split("\n"),
    hold: 1.8,
  },
  {
    cmd: "npx @pdfdiff/cli work-order-original.pdf work-order-amended.pdf --text-only",
    lines: clamp(text, 11),
    hold: 2.0,
  },
];

const LOCKUP_SVG =
  '<svg class="mark" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<rect width="64" height="64" rx="15" fill="#2563EB"/>' +
  '<path d="M32 18.5A13.5 13.5 0 0 0 32 45.5V18.5Z" fill="#FFFFFF"/>' +
  '<circle cx="32" cy="32" r="13.5" stroke="#FFFFFF" stroke-width="3.5"/></svg>';

const THEME = `
  @font-face {
    font-family: Inter; font-style: normal; font-weight: 400 700; font-display: block;
    src: url("data:font/woff2;base64,__INTER__") format("woff2");
  }
  :root {
    --background: hsl(240 10% 4%); --foreground: hsl(0 0% 98%); --card: hsl(240 6% 7%);
    --primary: hsl(217 91% 60%); --muted-foreground: hsl(240 5% 65%);
    --border: hsl(240 4% 16%); --stage-dot: hsl(240 6% 12%);
    --success: hsl(142 71% 45%); --destructive: hsl(0 72% 51%);
    --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
    --font-mono: ui-monospace, Menlo, "SFMono-Regular", Consolas, monospace;
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
  .lockup { display: flex; align-items: center; gap: 20px; }
  .mark { width: 76px; height: 76px; border-radius: 18px; display: block; }
  .word { font-size: 60px; font-weight: 600; letter-spacing: -0.01em; }
`;

const TERMINAL_HTML = `<!doctype html>
<html class="dark"><head><meta charset="utf-8"><style>${THEME}
  #lockup {
    position: fixed; left: 50%; top: 50%; z-index: 3;
    transform: translate(-50%,-50%) scale(1); opacity: 1;
    font-size: 82px; font-weight: 600; letter-spacing: -0.01em;
    display: flex; align-items: center; gap: 22px;
  }
  #lockup .mark { width: 104px; height: 104px; border-radius: 24px; }
  #card {
    position: fixed; left: 50%; top: 50%; width: ${CARD.w}px; height: ${CARD.h}px;
    transform: translate(-50%,-50%) scale(0.94); opacity: 0;
    background: var(--card); border: 1px solid var(--border); border-radius: 18px;
    box-shadow: 0 30px 90px rgba(0,0,0,.65); overflow: hidden;
    display: flex; flex-direction: column;
  }
  .bar {
    display: flex; align-items: center; gap: 12px; flex: none;
    padding: 18px 26px; border-bottom: 1px solid var(--border);
  }
  .dot { width: 14px; height: 14px; border-radius: 999px; background: var(--border); }
  .title {
    margin-left: 14px; font-size: 22px; font-weight: 500; letter-spacing: -0.01em;
    color: var(--muted-foreground);
  }
  #screen {
    flex: 1; min-height: 0; overflow: hidden; padding: 30px 34px 34px;
    font-family: var(--font-mono); font-size: 29px; line-height: 1.52;
    display: flex; flex-direction: column; gap: 2px;
  }
  /* pre-wrap: the unreadable-font warning is one long line and pre ran off the card. */
  .row { white-space: pre-wrap; overflow-wrap: anywhere; }
  .prompt { color: var(--primary); font-weight: 600; }
  .caret {
    display: inline-block; width: 15px; height: 30px; margin-bottom: -4px;
    background: var(--foreground); animation: blink 1s steps(1) infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }
  .out { color: var(--muted-foreground); }
  .add { color: var(--success); }
  .del { color: var(--destructive); }
  .mod { color: var(--primary); }
  .head { color: var(--foreground); font-weight: 600; }
  .row, #shot { animation: rise 220ms cubic-bezier(.2,.7,.3,1) both; }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  #shot {
    align-self: center; max-width: 76%; max-height: 470px; margin-top: 14px;
    border: 1px solid var(--border); border-radius: 10px; background: #fff;
  }
</style></head><body>
  <div id="lockup">${LOCKUP_SVG}<span>pdfdiff</span></div>
  <div id="card">
    <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <span class="title">agent — pdfdiff</span></div>
    <div id="screen"></div>
  </div>
<script>
const BEATS = __BEATS__;
const screenEl = document.getElementById("screen");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Colour a report line by the marker the CLI already prints. */
function classify(line) {
  const t = line.trimStart();
  if (t.startsWith("+")) return "add";
  if (t.startsWith("-")) return "del";
  if (t.startsWith("~")) return "mod";
  if (/^(Page \\d|\\S.*→)/.test(t) || /pages?$/.test(t)) return "head";
  return "out";
}

function push(html, cls) {
  const row = document.createElement("div");
  row.className = "row" + (cls ? " " + cls : "");
  row.innerHTML = html;
  screenEl.appendChild(row);
  // The screen is bottom-aligned, so old rows leave the top the way a terminal scrolls.
  while (screenEl.scrollHeight > screenEl.clientHeight && screenEl.firstChild) {
    screenEl.firstChild.remove();
  }
  return row;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function type(cmd) {
  const row = push('<span class="prompt">$</span> <span class="cmd"></span><span class="caret"></span>', "");
  const cmdEl = row.querySelector(".cmd");
  for (const ch of cmd) {
    cmdEl.textContent += ch;
    // Uneven, like a person: a flat interval reads as a progress bar, not typing.
    await sleep(14 + Math.random() * 26);
  }
  await sleep(280);
  row.querySelector(".caret").remove();
}

async function play() {
  document.getElementById("lockup").style.transition = "opacity 420ms cubic-bezier(.2,.7,.25,1), transform 620ms cubic-bezier(.2,.7,.25,1)";
  const card = document.getElementById("card");
  card.style.transition = "opacity 520ms cubic-bezier(.2,.7,.25,1), transform 720ms cubic-bezier(.2,.7,.25,1)";
  await sleep(380);
  const lock = document.getElementById("lockup");
  lock.style.opacity = "0";
  lock.style.transform = "translate(-50%,-50%) scale(0.82)";
  card.style.opacity = "1";
  card.style.transform = "translate(-50%,-50%) scale(1)";
  await sleep(720);

  for (const beat of BEATS) {
    await type(beat.cmd);
    for (const line of beat.lines) {
      push(esc(line) || "&nbsp;", classify(line));
      await sleep(70);
    }
    if (beat.image) {
      const img = document.createElement("img");
      img.id = "shot";
      img.src = beat.image;
      screenEl.appendChild(img);
      await img.decode().catch(() => {});
      while (screenEl.scrollHeight > screenEl.clientHeight && screenEl.firstChild !== img) {
        screenEl.firstChild.remove();
      }
    }
    await sleep(beat.hold * 1000);
    push("&nbsp;", "");
  }
}
window.play = play;
</script>
</body></html>`;

const END_CARD_HTML = `<!doctype html>
<html class="dark"><head><meta charset="utf-8"><style>${THEME}
  .stack { display: flex; flex-direction: column; align-items: flex-start; gap: 50px; }
  h1 { font-size: 104px; font-weight: 600; line-height: 1.05; letter-spacing: -0.025em; }
  .accent { color: var(--primary); font-style: normal; }
  .cmd {
    font-family: var(--font-mono); font-size: 40px; letter-spacing: -0.01em;
    padding: 20px 32px; border: 1px solid var(--border); border-radius: 14px;
    background: var(--card); opacity: 0; transform: translateY(16px);
  }
  .cmd .prompt { color: var(--primary); font-weight: 600; }
  .go .cmd { animation: rise 520ms cubic-bezier(.2,.7,.3,1) 520ms forwards; }
  .lead { font-size: 34px; color: var(--muted-foreground); letter-spacing: -0.01em;
    opacity: 0; }
  .go .lead { animation: rise 520ms cubic-bezier(.2,.7,.3,1) 900ms forwards; }
  @keyframes rise { to { opacity: 1; transform: none; } }
  .card { position: relative; }
  .top { clip-path: inset(0 100% 0 0); position: absolute; inset: 0; }
  .go .top { animation: reveal 1000ms cubic-bezier(.4,0,.2,1) forwards; }
  @keyframes reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  .divider {
    position: absolute; top: -30px; bottom: -30px; left: 0; width: 5px;
    background: var(--primary); box-shadow: 0 0 24px hsl(217 91% 60% / .55); opacity: 0;
  }
  .go .divider { animation: slide 1000ms cubic-bezier(.4,0,.2,1) forwards; }
  @keyframes slide { 0% { left: 0; opacity: 1; } 85% { opacity: 1; } 100% { left: 100%; opacity: 0; } }
  .base h1 .accent { color: var(--foreground); }
  .base .mark { opacity: .28; filter: grayscale(1); }
</style></head><body>
  <div class="stack">
    <div class="card">
      <div class="layer base">
        <div class="lockup">${LOCKUP_SVG}<span class="word">pdfdiff</span></div>
        <h1 style="margin-top:34px">Compare PDFs.<br><em class="accent">In your terminal.</em></h1>
      </div>
      <div class="layer top">
        <div class="lockup">${LOCKUP_SVG}<span class="word">pdfdiff</span></div>
        <h1 style="margin-top:34px">Compare PDFs.<br><em class="accent">In your terminal.</em></h1>
      </div>
      <div class="divider"></div>
    </div>
    <div class="cmd"><span class="prompt">$</span> npx @pdfdiff/cli old.pdf new.pdf</div>
    <p class="lead">pdfdiff.app · docs at pdfdiff.app/llms.txt</p>
  </div>
</body></html>`;

/** Inline the webfont: setContent has no origin, so a /fonts/ URL would 404. */
const inter = readFileSync("public/fonts/inter-latin.woff2").toString("base64");
// Replacer functions: $& and friends in the beats JSON would otherwise be expanded.
const html = (source, extra = {}) => {
  const beats = JSON.stringify(extra.beats ?? []);
  return source.replace("__INTER__", () => inter).replace("__BEATS__", () => beats);
};

// Accurate forward seek (-ss after -i); Playwright's webm is variable-frame-rate.
function trim(raw, mark, seconds, dest) {
  execFileSync("ffmpeg", [
    // prettier-ignore
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

async function capture(browser, name, source, play, seconds) {
  const dir = join(work, name);
  const context = await browser.newContext({ ...contextOptions, recordVideo: { dir, size } });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  const t0 = Date.now();
  await page.setContent(source, { waitUntil: "load" });
  // Resolve to a boolean: a FontFaceSet cannot cross the Playwright bridge.
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(250);
  const mark = (Date.now() - t0) / 1000;
  await play(page);
  await page.waitForTimeout(seconds * 1000 + 250);
  await context.close();
  const file = readdirSync(dir).find((f) => f.endsWith(".webm"));
  if (!file) throw new Error(`no video captured for ${name}`);
  const raw = join(dir, `${name}-raw.webm`);
  renameSync(join(dir, file), raw);
  return trim(raw, mark, seconds, join(work, `${name}.mp4`));
}

// Typing is timed in the page, so the take's length is whatever the script takes:
// measure it there rather than guessing here and trimming into the middle of a line.
const TERMINAL_SECONDS =
  INTRO_SECONDS + BEATS.reduce((n, b) => n + b.cmd.length * 0.027 + 0.28 + b.lines.length * 0.07 + b.hold + 0.1, 0);

const browser = await chromium.launch();
process.stdout.write("recording terminal... ");
const termClip = await capture(
  browser,
  "terminal",
  html(TERMINAL_HTML, { beats: BEATS }),
  (page) => page.evaluate(() => window.play()),
  TERMINAL_SECONDS,
);
console.log(`ok (${TERMINAL_SECONDS.toFixed(1)}s)`);

process.stdout.write("recording end card... ");
const endClip = await capture(
  browser,
  "end",
  html(END_CARD_HTML),
  (page) => page.evaluate(() => document.body.classList.add("go")),
  END_SECONDS,
);
console.log("ok");
await browser.close();

const total = Number((TERMINAL_SECONDS + END_SECONDS - XFADE).toFixed(3));
const silent = join(work, "silent.mp4");
execFileSync("ffmpeg", [
  // prettier-ignore
  "-y",
  "-loglevel",
  "error",
  "-i",
  termClip,
  "-i",
  endClip,
  "-filter_complex",
  `[0:v][1:v]xfade=transition=fade:duration=${XFADE}:offset=${(TERMINAL_SECONDS - XFADE).toFixed(3)}[v]`,
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

if (existsSync(music)) {
  execFileSync("ffmpeg", [
    // prettier-ignore
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
  // prettier-ignore
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
  // prettier-ignore
  "-y",
  "-loglevel",
  "error",
  "-i",
  silent,
  "-vf",
  // Terminal text needs the width more than the frame rate.
  "fps=12,scale=820:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];" +
    "[b][p]paletteuse=dither=bayer:bayer_scale=3",
  `${out}.gif`,
]);

rmSync(work, { recursive: true, force: true });
console.log(`\nwrote ${out}.mp4, ${out}.webm, ${out}.gif (${total}s)`);
