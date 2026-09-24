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
  assert.match(html, /"@type":\s*"WebApplication"/);
  assert.match(html, /rel="icon" href="\/favicon\.svg"/i);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/i);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/i);
  assert.doesNotMatch(html, /google-analytics|gtag\(|googletagmanager|posthog/i);
  assert.equal(existsSync(new URL("../dist/server/", import.meta.url)), false);
  // Staged from the CLI package, not committed, and the sitemap advertises it.
  assert.equal(existsSync(new URL("../dist/llms.txt", import.meta.url)), true);
  assert.equal(existsSync(new URL("../dist/fonts/inter-latin.woff2", import.meta.url)), true);

  const bundle = await clientBundleText();
  assert.match(bundle, /never uploaded/i);
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

function titleOf(html) {
  const match = html.match(/<title>([^<]*)<\/title>/);
  assert.ok(match, "expected a <title>");
  return match[1];
}

function canonicalHref(html) {
  const match = html.match(/rel="canonical" href="([^"]+)"/);
  assert.ok(match, "expected a canonical link");
  return match[1];
}

test("prerenders unique crawlable HTML for home, privacy, and terms", async () => {
  const homeUrl = new URL("../dist/index.html", import.meta.url);
  const privacyUrl = new URL("../dist/privacy/index.html", import.meta.url);
  const termsUrl = new URL("../dist/terms/index.html", import.meta.url);

  const home = await readFile(homeUrl, "utf8");
  const privacy = await readFile(privacyUrl, "utf8");
  const terms = await readFile(termsUrl, "utf8");

  assert.equal(canonicalHref(home), "https://pdfdiff.app/");
  assert.equal(canonicalHref(privacy), "https://pdfdiff.app/privacy");
  assert.equal(canonicalHref(terms), "https://pdfdiff.app/terms");

  assert.equal(titleOf(home), "Compare two PDFs privately in your browser | pdfdiff");
  assert.equal(titleOf(privacy), "Privacy Policy — pdfdiff");
  assert.equal(titleOf(terms), "Terms of Service — pdfdiff");

  assert.match(
    privacy,
    /name="description"\s+content="How pdfdiff handles PDF files, browser storage, and technical data\."/,
  );
  assert.match(
    terms,
    /name="description"\s+content="The terms that govern use of the pdfdiff browser-based PDF comparison service\."/,
  );
  assert.match(privacy, /property="og:url" content="https:\/\/pdfdiff\.app\/privacy"/);
  assert.match(terms, /property="og:url" content="https:\/\/pdfdiff\.app\/terms"/);
  assert.match(privacy, /property="og:title" content="Privacy Policy — pdfdiff"/);
  assert.match(terms, /property="og:title" content="Terms of Service — pdfdiff"/);
  assert.match(privacy, /name="twitter:title" content="Privacy Policy — pdfdiff"/);
  assert.match(terms, /name="twitter:title" content="Terms of Service — pdfdiff"/);
  assert.match(
    privacy,
    /name="twitter:description"\s+content="How pdfdiff handles PDF files, browser storage, and technical data\."/,
  );
  assert.match(
    terms,
    /name="twitter:description"\s+content="The terms that govern use of the pdfdiff browser-based PDF comparison service\."/,
  );

  assert.match(privacy, /your PDFs are processed locally/i);
  assert.match(terms, /These terms govern your use of pdfdiff/i);
  assert.match(privacy, /<h1>[^<]*Privacy Policy/i);
  assert.match(terms, /<h1>[^<]*Terms of Service/i);
  assert.match(privacy, /Last updated September 5, 2026/);
  assert.match(terms, /Last updated September 5, 2026/);

  assert.match(home, /<div id="root"[^>]*>[\s\S]*<h1>[\s\S]*Compare PDFs/);
  assert.match(home, /Files are compared in this browser and never uploaded/);
  assert.match(home, /Files never leave (your|the) device/i);
  for (const page of [home, privacy, terms]) {
    assert.match(page, /#app-fallback\s*\{\s*display:\s*none/);
    assert.match(page, /id="app-fallback"/);
  }

  assert.match(home, /"@type":\s*"WebApplication"/);
  assert.doesNotMatch(privacy, /"@type":\s*"WebApplication"/);
  assert.doesNotMatch(terms, /"@type":\s*"WebApplication"/);
});
