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

function moduleSources(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/gi)].map((match) => match[1]);
}

test("builds a crawlable marketing page and a separate compare workspace", async () => {
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
  assert.match(html, /<h1[^>]*>[\s\S]*Compare PDFs/);
  assert.match(html, /href="\/app"/);
  assert.match(html, /never uploaded/i);
  assert.match(html, /<script[^>]+type="module"/i);
  assert.match(html, /<link[^>]+stylesheet/i);
  assert.doesNotMatch(html, /id="root"|\/main\.tsx/i);
  assert.doesNotMatch(html, /google-analytics|gtag\(|googletagmanager|posthog/i);
  assert.equal(existsSync(new URL("../dist/server/", import.meta.url)), false);
  assert.equal(existsSync(new URL("../dist/robots.txt", import.meta.url)), true);
  assert.equal(existsSync(new URL("../dist/sitemap.xml", import.meta.url)), true);
  // Staged from the CLI package, not committed, and the sitemap advertises it.
  assert.equal(existsSync(new URL("../dist/llms.txt", import.meta.url)), true);
  assert.equal(existsSync(new URL("../dist/og.png", import.meta.url)), true);
  assert.equal(existsSync(new URL("../dist/fonts/inter-latin.woff2", import.meta.url)), true);

  const sitemap = await readFile(new URL("../dist/sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /<loc>https:\/\/pdfdiff\.app\/app<\/loc>/);

  const marketingModules = await Promise.all(
    moduleSources(html).map((src) => readFile(new URL(`../dist${src}`, import.meta.url), "utf8")),
  );
  assert.doesNotMatch(marketingModules.join("\n"), /createRoot|PdfDiffApp/);

  const bundle = await clientBundleText();
  assert.match(bundle, /never uploaded/i);
});

test("dist ships static legal pages and the React compare entry", async () => {
  const privacy = await readFile(new URL("../dist/privacy/index.html", import.meta.url), "utf8");
  const terms = await readFile(new URL("../dist/terms/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../dist/app/index.html", import.meta.url), "utf8");

  assert.match(privacy, /<title>Privacy Policy — pdfdiff<\/title>/);
  assert.match(privacy, /rel="canonical" href="https:\/\/pdfdiff\.app\/privacy"/);
  assert.match(privacy, /How\ pdfdiff\ handles\ PDF\ files,\ browser\ storage,\ and\ technical\ data\./);
  assert.match(privacy, /Last updated September 5, 2026/);
  assert.match(privacy, /never uploaded/i);
  assert.doesNotMatch(privacy, /"@type":\s*"WebApplication"|id="root"|\/main\.tsx/);

  assert.match(terms, /<title>Terms of Service — pdfdiff<\/title>/);
  assert.match(terms, /rel="canonical" href="https:\/\/pdfdiff\.app\/terms"/);
  assert.match(terms, /These terms govern your use of pdfdiff/);
  assert.match(terms, /Last updated September 5, 2026/);
  assert.doesNotMatch(terms, /"@type":\s*"WebApplication"|id="root"|\/main\.tsx/);
  assert.notEqual(privacy.match(/<title>([^<]*)<\/title>/)?.[1], terms.match(/<title>([^<]*)<\/title>/)?.[1]);

  assert.match(app, /<title>Compare PDFs in your browser \| pdfdiff<\/title>/);
  assert.match(app, /rel="canonical" href="https:\/\/pdfdiff\.app\/app"/);
  assert.match(app, /id="root"/);
  assert.match(app, /<script[^>]*type="module"[^>]*>/);
  assert.ok(moduleSources(app).some((src) => src.startsWith("/assets/") && src.endsWith(".js")));
  assert.doesNotMatch(app, /fonts\.googleapis|fonts\.gstatic|google-analytics|gtag\(|googletagmanager|posthog/i);
  const appModules = await Promise.all(
    moduleSources(app).map((src) => readFile(new URL(`../dist${src}`, import.meta.url), "utf8")),
  );
  assert.match(appModules.join("\n"), /never uploaded/i);
});

test("built CSS self-hosts Inter", async () => {
  const assetsDirectory = new URL("../dist/assets/", import.meta.url);
  const files = await readdir(assetsDirectory);
  const css = files.filter((file) => file.endsWith(".css"));
  const styles = (await Promise.all(css.map((file) => readFile(new URL(file, assetsDirectory), "utf8")))).join("\n");
  assert.match(styles, /\/fonts\/inter-latin\.woff2/);
  assert.doesNotMatch(styles, /fonts\.googleapis|fonts\.gstatic/i);
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

test("dist ships security headers and PDF.js side-cars", async () => {
  const headers = await readFile(new URL("../dist/_headers", import.meta.url), "utf8");
  assert.match(headers, /Content-Security-Policy:.*worker-src 'self' blob:/);
  assert.match(headers, /\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers, /\/pdfjs\/\*\n {2}Cache-Control: public, max-age=86400/);
  assert.equal(existsSync(new URL("../dist/pdfjs/cmaps", import.meta.url)), true);
  assert.equal(existsSync(new URL("../dist/pdfjs/wasm", import.meta.url)), true);
  assert.equal(existsSync(new URL("../dist/pdfjs/standard_fonts", import.meta.url)), true);
  assert.equal(existsSync(new URL("../dist/pdfjs/iccs", import.meta.url)), true);
});

test("Cloudflare deployment contains static assets only", async () => {
  const config = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.doesNotMatch(config, /"main"\s*:/);
  assert.doesNotMatch(config, /"binding"\s*:/);
  assert.match(config, /"directory"\s*:\s*"\.\/dist"/);
});
