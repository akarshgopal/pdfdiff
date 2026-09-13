import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { loadSamplePair, SAMPLE_DOCUMENTS, sampleDocument, samplePublicPath } from "../app/pdfdiff/sampleDocuments.ts";

test("the try-sample catalog is CAD, contract, and the smaller TI datasheet pair", () => {
  assert.deepEqual(
    SAMPLE_DOCUMENTS.map((sample) => sample.id),
    ["cad", "contract", "datasheet"],
  );
  assert.equal(SAMPLE_DOCUMENTS[0]?.label, "CAD");
  assert.equal(SAMPLE_DOCUMENTS[1]?.label, "Contract");
  assert.equal(SAMPLE_DOCUMENTS[2]?.label, "Datasheet");
  assert.match(sampleDocument("cad").earlier.source, /wheel-hub-rev-a/);
  assert.match(sampleDocument("cad").newer.source, /wheel-hub-rev-b/);
  assert.match(sampleDocument("contract").earlier.source, /work-order-original/);
  assert.match(sampleDocument("contract").newer.source, /work-order-amended/);
  assert.match(sampleDocument("datasheet").earlier.source, /ti-sn74lv126a-rev-i/);
  assert.match(sampleDocument("datasheet").newer.source, /ti-sn74lv126a-rev-j/);
});

test("sample files are served from /samples and exist in the fixture tree", () => {
  for (const sample of SAMPLE_DOCUMENTS) {
    for (const side of [sample.earlier, sample.newer]) {
      assert.equal(samplePublicPath(side.source), `/samples/${side.source}`);
      assert.equal(path.basename(side.source), side.name);
      assert.equal(existsSync(path.join("examples/pdf-fixtures", side.source)), true, side.source);
    }
  }
});

test("loadSamplePair fetches both sides as named PDF files", async () => {
  const bodies = new Map([
    ["/samples/cad/wheel-hub-rev-a.pdf", "earlier-bytes"],
    ["/samples/cad/wheel-hub-rev-b.pdf", "newer-bytes"],
  ]);
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requested.push(url);
    const body = bodies.get(url);
    assert.ok(body, url);
    assert.equal(init?.signal, undefined);
    return new Response(body, { status: 200, headers: { "Content-Type": "application/pdf" } });
  }) as typeof fetch;
  try {
    const pair = await loadSamplePair("cad");
    assert.deepEqual(requested, ["/samples/cad/wheel-hub-rev-a.pdf", "/samples/cad/wheel-hub-rev-b.pdf"]);
    assert.equal(pair.earlier.name, "wheel-hub-rev-a.pdf");
    assert.equal(pair.newer.name, "wheel-hub-rev-b.pdf");
    assert.equal(pair.earlier.type, "application/pdf");
    assert.equal(pair.newer.type, "application/pdf");
    assert.equal(await pair.earlier.text(), "earlier-bytes");
    assert.equal(await pair.newer.text(), "newer-bytes");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadSamplePair fails when a sample cannot be fetched", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(() => loadSamplePair("contract"), /Failed to load work-order-original\.pdf/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadSamplePair rejects an SPA HTML 200 as a missing PDF", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<!doctype html><title>pdfdiff</title>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })) as typeof fetch;
  try {
    await assert.rejects(() => loadSamplePair("cad"), /Failed to load wheel-hub-rev-a\.pdf/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadSamplePair accepts a PDF body when Content-Type is missing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("%PDF-1.4 mock", { status: 200 })) as typeof fetch;
  try {
    const pair = await loadSamplePair("cad");
    assert.equal(pair.earlier.type, "application/pdf");
    assert.equal(await pair.earlier.text(), "%PDF-1.4 mock");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadSamplePair forwards abort to both fetches", async () => {
  const abortController = new AbortController();
  abortController.abort();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.signal?.aborted, true);
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }) as typeof fetch;
  try {
    await assert.rejects(() => loadSamplePair("datasheet", abortController.signal), { name: "AbortError" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
