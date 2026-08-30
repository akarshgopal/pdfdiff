import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function clientBundleText() {
  const assetsDirectory = new URL("../dist/assets/", import.meta.url);
  const files = await readdir(assetsDirectory);
  const scripts = files.filter((file) => file.endsWith(".js"));
  return (await Promise.all(scripts.map((file) => readFile(new URL(file, assetsDirectory), "utf8")))).join("\n");
}

test("builds a static private PDF comparison experience", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>PDF Diff — compare documents privately<\/title>/i);
  assert.match(html, /name="description" content="Compare PDF revisions page by page\. Your documents stay entirely in your browser\."/i);
  assert.match(html, /rel="icon" href="\/favicon\.svg"/i);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/i);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/i);
  assert.match(html, /id="root"/i);
  assert.match(html, /<script[^>]+type="module"/i);
  assert.match(html, /<link[^>]+stylesheet/i);
  assert.equal(existsSync(new URL("../dist/server/", import.meta.url)), false);

  const bundle = await clientBundleText();
  assert.match(bundle, /Compare PDFs/);
  assert.match(bundle, /Earlier/i);
  assert.match(bundle, /Newer/i);
  assert.match(bundle, /Files stay on your device/i);
  assert.match(bundle, /How it works/i);
  assert.doesNotMatch(bundle, /Review-ready detail/i);
  assert.match(bundle, /Toggle dark mode/i);
  assert.match(bundle, /Only filenames, sizes, dates, and settings are saved/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("Cloudflare deployment contains static assets only", async () => {
  const config = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.doesNotMatch(config, /"main"\s*:/);
  assert.doesNotMatch(config, /"binding"\s*:/);
  assert.match(config, /"directory"\s*:\s*"\.\/dist"/);
});
