import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HOME_DESCRIPTION, HOME_TITLE } from "../app/pdfdiff/routes.ts";
import { rewriteAbsoluteSiteMetadata } from "../vite.config.ts";

const root = new URL("../", import.meta.url);

function pngSize(buffer: Buffer): { width: number; height: number } {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("index.html ships title, description, social cards, and WebApplication JSON-LD", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.ok(html.includes(`<title>${HOME_TITLE}</title>`));
  assert.ok(html.includes(`content="${HOME_DESCRIPTION}"`));
  assert.match(html, /rel="canonical" href="https:\/\/pdfdiff\.app\/"/);
  assert.match(html, /property="og:url" content="https:\/\/pdfdiff\.app\/"/);
  assert.match(html, /property="og:image" content="https:\/\/pdfdiff\.app\/og\.png"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:image" content="https:\/\/pdfdiff\.app\/og\.png"/);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/i);
  assert.match(html, /rel="preload" href="\/fonts\/inter-latin\.woff2"/);
  assert.doesNotMatch(html, /google-analytics|gtag\(|googletagmanager|posthog/i);

  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, "expected JSON-LD script");
  const schema = JSON.parse(jsonLdMatch[1]) as {
    "@type": string;
    isAccessibleForFree: boolean;
    offers: { price: string };
    featureList: string[];
    description: string;
  };
  assert.equal(schema["@type"], "WebApplication");
  assert.equal(schema.isAccessibleForFree, true);
  assert.equal(schema.offers.price, "0");
  assert.match(schema.description, /never leave your device/i);
  assert.ok(schema.featureList.some((item) => /never leave the device/i.test(item)));
});

test("VITE_SITE_URL rewrites the hardcoded pdfdiff.app origin in index.html", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /https:\/\/pdfdiff\.app\//);
  assert.equal(rewriteAbsoluteSiteMetadata(html, null), html);
  assert.equal(rewriteAbsoluteSiteMetadata(html, "https://pdfdiff.app"), html);

  const preview = rewriteAbsoluteSiteMetadata(html, "https://pdfdiff.example");
  assert.doesNotMatch(preview, /https:\/\/pdfdiff\.app/);
  assert.match(preview, /rel="canonical" href="https:\/\/pdfdiff\.example\/"/);
  assert.match(preview, /property="og:url" content="https:\/\/pdfdiff\.example\/"/);
  assert.match(preview, /property="og:image" content="https:\/\/pdfdiff\.example\/og\.png"/);
  assert.match(preview, /name="twitter:image" content="https:\/\/pdfdiff\.example\/og\.png"/);
  assert.match(preview, /"url": "https:\/\/pdfdiff\.example\/"/);
  assert.match(preview, /"termsOfService": "https:\/\/pdfdiff\.example\/terms"/);
});

test("robots.txt and sitemap.xml point at pdfdiff.app", async () => {
  const robots = await readFile(new URL("public/robots.txt", root), "utf8");
  assert.match(robots, /^User-agent: \*\nAllow: \/\nDisallow: \/samples\/\n/m);
  assert.match(robots, /Sitemap: https:\/\/pdfdiff\.app\/sitemap\.xml/);

  const sitemap = await readFile(new URL("public/sitemap.xml", root), "utf8");
  assert.match(sitemap, /<loc>https:\/\/pdfdiff\.app\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/pdfdiff\.app\/privacy<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/pdfdiff\.app\/terms<\/loc>/);
});

test("og.png is a compact PNG matching the Open Graph dimensions", async () => {
  const png = await readFile(new URL("public/og.png", root));
  assert.ok(png.byteLength < 300 * 1024, `og.png is ${png.byteLength} bytes`);
  assert.deepEqual(pngSize(png), { width: 1200, height: 630 });
});

test("Inter is self-hosted and CSP does not allow Google Fonts", async () => {
  const font = await readFile(new URL("public/fonts/inter-latin.woff2", root));
  assert.equal(font.subarray(0, 4).toString(), "wOF2");
  const headers = await readFile(new URL("public/_headers", root), "utf8");
  assert.match(headers, /font-src 'self'/);
  assert.doesNotMatch(headers, /fonts\.googleapis|fonts\.gstatic/i);
});
