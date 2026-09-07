import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("index.html ships title, description, social cards, and WebApplication JSON-LD", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(html, /<title>Compare two PDFs privately in your browser \| pdfdiff<\/title>/);
  assert.match(
    html,
    /name="description"\s+content="Free, browser-based PDF compare\. See text and drawing changes between two revisions, page by page\. Files never leave your device — nothing is uploaded\."/,
  );
  assert.match(html, /rel="canonical" href="https:\/\/pdfdiff\.app\/"/);
  assert.match(html, /property="og:url" content="https:\/\/pdfdiff\.app\/"/);
  assert.match(html, /property="og:image" content="https:\/\/pdfdiff\.app\/og\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:image" content="https:\/\/pdfdiff\.app\/og\.png"/);
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

test("robots.txt and sitemap.xml point at pdfdiff.app", async () => {
  const robots = await readFile(new URL("public/robots.txt", root), "utf8");
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/m);
  assert.match(robots, /Sitemap: https:\/\/pdfdiff\.app\/sitemap\.xml/);

  const sitemap = await readFile(new URL("public/sitemap.xml", root), "utf8");
  assert.match(sitemap, /<loc>https:\/\/pdfdiff\.app\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/pdfdiff\.app\/privacy<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/pdfdiff\.app\/terms<\/loc>/);
});
