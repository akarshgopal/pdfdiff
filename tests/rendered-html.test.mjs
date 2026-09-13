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
  assert.match(html, /<title>Compare two PDFs privately in your browser \| pdfdiff<\/title>/i);
  assert.match(html, /name="description"\s+content="[^"]*Files never leave your device[^"]*"/i);
  assert.match(html, /rel="canonical" href="https:\/\/pdfdiff\.app\/"/i);
  assert.match(html, /property="og:image" content="https:\/\/pdfdiff\.app\/og\.png"/i);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /name="twitter:image" content="https:\/\/pdfdiff\.app\/og\.png"/i);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/i);
  assert.match(html, /rel="preload" href="\/fonts\/inter-latin\.woff2"/);
  assert.match(html, /type="application\/ld\+json"/i);
  assert.match(html, /"@type":\s*"WebApplication"/);
  assert.match(html, /rel="icon" href="\/favicon\.svg"/i);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/i);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/i);
  assert.match(html, /id="root"/i);
  assert.match(html, /<script[^>]+type="module"/i);
  assert.match(html, /<link[^>]+stylesheet/i);
  assert.doesNotMatch(html, /google-analytics|gtag\(|googletagmanager|posthog/i);
  assert.equal(existsSync(new URL("../dist/server/", import.meta.url)), false);
  assert.equal(existsSync(new URL("../dist/robots.txt", import.meta.url)), true);
  assert.equal(existsSync(new URL("../dist/sitemap.xml", import.meta.url)), true);
  assert.equal(existsSync(new URL("../dist/og.png", import.meta.url)), true);
  assert.equal(existsSync(new URL("../dist/fonts/inter-latin.woff2", import.meta.url)), true);

  // One smoke check that the SPA actually shipped its app code; the copy itself is not a contract.
  const bundle = await clientBundleText();
  assert.match(bundle, /Files are compared in this browser and never uploaded/i);
  // The hero demo is drawn, not screenshotted: both revisions and both overlay colours ship in the bundle.
  assert.match(bundle, /24\.0/);
  assert.match(bundle, /26\.5/);
  assert.match(bundle, /pdfdiff-swipe-top/);
  assert.match(bundle, /Try a sample/);
  assert.match(bundle, /Datasheet/);
  assert.match(bundle, /This page does not exist/);
  assert.match(bundle, /Privacy Policy — pdfdiff/);
  assert.match(bundle, /Terms of Service — pdfdiff/);
  assert.match(bundle, /Page not found — pdfdiff/);
});

test("built CSS self-hosts Inter and the OG image stays compact", async () => {
  const assetsDirectory = new URL("../dist/assets/", import.meta.url);
  const files = await readdir(assetsDirectory);
  const css = files.filter((file) => file.endsWith(".css"));
  const styles = (await Promise.all(css.map((file) => readFile(new URL(file, assetsDirectory), "utf8")))).join("\n");
  assert.match(styles, /\/fonts\/inter-latin\.woff2/);
  assert.doesNotMatch(styles, /fonts\.googleapis|fonts\.gstatic/i);

  const og = await readFile(new URL("../dist/og.png", import.meta.url));
  assert.ok(og.byteLength < 300 * 1024, `dist/og.png is ${og.byteLength} bytes`);
  assert.equal(og.readUInt32BE(16), 1200);
  assert.equal(og.readUInt32BE(20), 630);
});

test("try-sample fixture pairs ship as static files", () => {
  const samples = [
    "cad/wheel-hub-rev-a.pdf",
    "cad/wheel-hub-rev-b.pdf",
    "contracts/work-order-original.pdf",
    "contracts/work-order-amended.pdf",
    "datasheets/ti-sn74lv126a-rev-i.pdf",
    "datasheets/ti-sn74lv126a-rev-j.pdf",
  ];
  for (const file of samples) {
    assert.equal(existsSync(new URL(`../dist/samples/${file}`, import.meta.url)), true, file);
  }
});

test("Cloudflare deployment contains static assets only", async () => {
  const config = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.doesNotMatch(config, /"main"\s*:/);
  assert.doesNotMatch(config, /"binding"\s*:/);
  assert.match(config, /"directory"\s*:\s*"\.\/dist"/);
});
