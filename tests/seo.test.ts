import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  APP_DESCRIPTION,
  APP_TITLE,
  HOME_DESCRIPTION,
  HOME_TITLE,
  ROUTE_DOCUMENT_META,
} from "../app/pdfdiff/routes.ts";
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
  assert.match(sitemap, /<loc>https:\/\/pdfdiff\.app\/app<\/loc>/);
});

test("VITE_SITE_URL rewrites robots.txt and sitemap.xml the same way as index.html", async () => {
  const robots = await readFile(new URL("public/robots.txt", root), "utf8");
  const sitemap = await readFile(new URL("public/sitemap.xml", root), "utf8");
  const previewRobots = rewriteAbsoluteSiteMetadata(robots, "https://pdfdiff.example");
  const previewSitemap = rewriteAbsoluteSiteMetadata(sitemap, "https://pdfdiff.example");
  assert.match(previewRobots, /Sitemap: https:\/\/pdfdiff\.example\/sitemap\.xml/);
  assert.doesNotMatch(previewRobots, /pdfdiff\.app/);
  assert.match(previewSitemap, /<loc>https:\/\/pdfdiff\.example\/<\/loc>/);
  assert.match(previewSitemap, /<loc>https:\/\/pdfdiff\.example\/privacy<\/loc>/);
  assert.doesNotMatch(previewSitemap, /pdfdiff\.app/);
});

test("og.png matches the Open Graph dimensions", async () => {
  const png = await readFile(new URL("public/og.png", root));
  assert.deepEqual(pngSize(png), { width: 1200, height: 630 });
});

test("CSP does not allow Google Fonts", async () => {
  const headers = await readFile(new URL("public/_headers", root), "utf8");
  assert.match(headers, /font-src 'self'/);
  assert.doesNotMatch(headers, /fonts\.googleapis|fonts\.gstatic/i);
});

test("landing page is static marketing HTML with a CTA to /app", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /<h1[^>]*>[\s\S]*Compare PDFs/);
  assert.match(html, /never uploaded/i);
  assert.match(html, /Files never leave your device/i);
  assert.match(html, /href="\/app"/);
  assert.match(html, /src="\/static-shell\.ts"/);
  assert.doesNotMatch(html, /id="root"|\/main\.tsx/);
});

test("privacy and terms are static HTML with their own titles, canonicals, and body copy", async () => {
  const privacy = await readFile(new URL("privacy/index.html", root), "utf8");
  const terms = await readFile(new URL("terms/index.html", root), "utf8");

  assert.ok(privacy.includes(`<title>${ROUTE_DOCUMENT_META.privacy.title}</title>`));
  assert.ok(privacy.includes(ROUTE_DOCUMENT_META.privacy.description));
  assert.match(privacy, /rel="canonical" href="https:\/\/pdfdiff\.app\/privacy"/);
  assert.match(privacy, /Short version:/);
  assert.match(privacy, /never uploaded/i);
  assert.match(privacy, /Last updated September 5, 2026/);
  assert.doesNotMatch(privacy, /"@type":\s*"WebApplication"|id="root"|\/main\.tsx/);

  assert.ok(terms.includes(`<title>${ROUTE_DOCUMENT_META.terms.title}</title>`));
  assert.ok(terms.includes(ROUTE_DOCUMENT_META.terms.description));
  assert.match(terms, /rel="canonical" href="https:\/\/pdfdiff\.app\/terms"/);
  assert.match(terms, /These terms govern your use of pdfdiff/);
  assert.match(terms, /Last updated September 5, 2026/);
  assert.doesNotMatch(terms, /"@type":\s*"WebApplication"|id="root"|\/main\.tsx/);
});

/** First element of `tag`. Site chrome is that header; legal pages also have an article header. */
function firstElement(html: string, tag: "header" | "footer"): string {
  const match = html.match(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`));
  assert.ok(match, `expected <${tag}>`);
  return match[0];
}

test("landing, privacy, and terms share identical site header and footer", async () => {
  const files = ["index.html", "privacy/index.html", "terms/index.html"] as const;
  const pages = await Promise.all(files.map((file) => readFile(new URL(file, root), "utf8")));
  const header = firstElement(pages[0], "header");
  const footer = firstElement(pages[0], "footer");
  for (const [index, html] of pages.entries()) {
    assert.equal(firstElement(html, "header"), header, files[index]);
    assert.equal(firstElement(html, "footer"), footer, files[index]);
  }
});

test("app/index.html is the React compare workspace", async () => {
  const html = await readFile(new URL("app/index.html", root), "utf8");
  assert.ok(html.includes(`<title>${APP_TITLE}</title>`));
  assert.ok(html.includes(`content="${APP_DESCRIPTION}"`));
  assert.match(html, /rel="canonical" href="https:\/\/pdfdiff\.app\/app"/);
  assert.match(html, /id="root"/);
  assert.match(html, /src="\/main\.tsx"/);
  assert.doesNotMatch(html, /"@type":\s*"WebApplication"/);
  assert.doesNotMatch(html, /static-shell\.ts/);
});

test("VITE_SITE_URL rewrites the origin in every HTML input", async () => {
  for (const file of ["index.html", "privacy/index.html", "terms/index.html", "app/index.html"]) {
    const html = await readFile(new URL(file, root), "utf8");
    assert.match(html, /https:\/\/pdfdiff\.app/, file);
    assert.equal(rewriteAbsoluteSiteMetadata(html, null), html, file);
    assert.equal(rewriteAbsoluteSiteMetadata(html, "https://pdfdiff.app"), html, file);
    const preview = rewriteAbsoluteSiteMetadata(html, "https://pdfdiff.example");
    assert.doesNotMatch(preview, /https:\/\/pdfdiff\.app/, file);
    assert.match(preview, /https:\/\/pdfdiff\.example/, file);
  }
});
