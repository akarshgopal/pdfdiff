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
  assert.match(html, /<title>pdfdiff — see what changed between two PDFs<\/title>/i);
  assert.match(html, /name="description" content="Compare two PDF revisions page by page[^"]*never leave your device\."/i);
  assert.match(html, /rel="icon" href="\/favicon\.svg"/i);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/i);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/i);
  assert.match(html, /id="root"/i);
  assert.match(html, /<script[^>]+type="module"/i);
  assert.match(html, /<link[^>]+stylesheet/i);
  assert.equal(existsSync(new URL("../dist/server/", import.meta.url)), false);

  // One smoke check that the SPA actually shipped its app code; the copy itself is not a contract.
  const bundle = await clientBundleText();
  assert.match(bundle, /Files are compared in this browser and never uploaded/i);
  // The hero demo is drawn, not screenshotted: both revisions and both overlay colours ship in the bundle.
  assert.match(bundle, /24\.0/);
  assert.match(bundle, /26\.5/);
  assert.match(bundle, /pdfdiff-swipe-top/);
});

test("Cloudflare deployment contains static assets only", async () => {
  const config = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.doesNotMatch(config, /"main"\s*:/);
  assert.doesNotMatch(config, /"binding"\s*:/);
  assert.match(config, /"directory"\s*:\s*"\.\/dist"/);
});
