import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the private PDF comparison experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>PDF Diff — compare documents privately<\/title>/i);
  assert.match(html, /name="description" content="Compare PDF revisions page by page\. Your documents stay entirely in your browser\."/i);
  assert.match(html, /rel="icon" href="\/favicon\.svg"/i);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/i);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/i);
  assert.doesNotMatch(html, /rel="icon" href="\/og\.png"/i);
  assert.match(html, /Compare PDF revisions/);
  assert.match(html, /Earlier/i);
  assert.match(html, /Newer/i);
  assert.match(html, /Files stay on your device/i);
  assert.match(html, /How it works/i);
  assert.match(html, /Review-ready detail/i);
  assert.match(html, /Toggle dark mode/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});
