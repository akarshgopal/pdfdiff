import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGE_MATCH_THRESHOLD } from "@pdfdiff/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PdfDiffViewer, type DiffPage } from "@pdfdiff/viewer-react";
import { PairingControls } from "../packages/viewer-react/dist/ViewerChrome.js";
import { isLikelyMispair, MISPAIR_CUE, temporaryPairCue } from "../packages/viewer-react/dist/viewer-utils.js";

function semantic(overrides: Partial<NonNullable<DiffPage["semantic"]>> = {}): NonNullable<DiffPage["semantic"]> {
  return {
    before: [],
    after: [],
    changes: [],
    beforeOverlays: [],
    afterOverlays: [],
    beforeTokenCount: 20,
    afterTokenCount: 20,
    hasBeforeText: true,
    hasAfterText: true,
    ...overrides,
  };
}

function page(overrides: Partial<DiffPage> = {}): DiffPage {
  return { index: 0, status: "changed", ...overrides };
}

const documentPages: DiffPage[] = [
  page({
    index: 0,
    earlierPageNumber: 1,
    newerPageNumber: 1,
    similarity: 0.92,
    changedPercent: 4,
    semantic: semantic(),
  }),
  page({
    index: 1,
    earlierPageNumber: 2,
    newerPageNumber: 2,
    similarity: 0.88,
    changedPercent: 6,
    semantic: semantic(),
  }),
];

test("the aligner's match cutoff is the same number the mispair cue uses", () => {
  assert.equal(PAGE_MATCH_THRESHOLD, 0.55);
});

test("a document pair stays quiet even when the page itself is a rewrite", () => {
  const rewrite = page({
    earlierPageNumber: 1,
    newerPageNumber: 1,
    similarity: 0.1,
    changedPercent: 80,
    semantic: semantic(),
  });
  assert.equal(isLikelyMispair(rewrite, documentPages), false);
  assert.equal(temporaryPairCue(rewrite, documentPages), null);
});

test("low text overlap on a pair the document never made is a likely mispair", () => {
  const stray = page({
    earlierPageNumber: 1,
    newerPageNumber: 2,
    similarity: 0.12,
    changedPercent: 8,
    semantic: semantic(),
  });
  assert.equal(isLikelyMispair(stray, documentPages), true);
  assert.equal(temporaryPairCue(stray, documentPages), MISPAIR_CUE);
});

test("high text overlap is a real rewrite, not a mispair, even at high visual density", () => {
  const rewrite = page({
    earlierPageNumber: 1,
    newerPageNumber: 2,
    similarity: 0.8,
    changedPercent: 70,
    semantic: semantic(),
  });
  assert.equal(isLikelyMispair(rewrite, documentPages), false);
});

test("Jaccard uses the same cutoff as document alignment", () => {
  const pair = (similarity: number): DiffPage =>
    page({
      earlierPageNumber: 1,
      newerPageNumber: 2,
      similarity,
      changedPercent: 8,
      semantic: semantic(),
    });
  assert.equal(isLikelyMispair(pair(PAGE_MATCH_THRESHOLD), documentPages), false);
  assert.equal(isLikelyMispair(pair(PAGE_MATCH_THRESHOLD - 0.01), documentPages), true);
});

test("pages without comparable text fall back to visual density versus the document", () => {
  const drawing = (changedPercent: number): DiffPage =>
    page({
      earlierPageNumber: 1,
      newerPageNumber: 2,
      changedPercent,
      semantic: semantic({ hasBeforeText: false, hasAfterText: false, beforeTokenCount: 0, afterTokenCount: 0 }),
    });
  assert.equal(isLikelyMispair(drawing(60), documentPages), true);
  assert.equal(isLikelyMispair(drawing(8), documentPages), false);
});

test("unreadable text ignores Jaccard and uses visual density", () => {
  const glyphs = page({
    earlierPageNumber: 1,
    newerPageNumber: 2,
    similarity: 0.05,
    changedPercent: 7,
    semantic: semantic({ textUndecodable: true }),
  });
  assert.equal(isLikelyMispair(glyphs, documentPages), false);
});

test("a pair still rendering or missing a side does not cue", () => {
  assert.equal(
    isLikelyMispair(page({ earlierPageNumber: 1, newerPageNumber: 2, status: "processing" }), documentPages),
    false,
  );
  assert.equal(
    isLikelyMispair(page({ earlierPageNumber: 1, status: "removed", changedPercent: 90 }), documentPages),
    false,
  );
});

test("document pairing never shows the temporary mispair cue", () => {
  const html = renderToStaticMarkup(
    createElement(PdfDiffViewer, {
      comparison: {
        earlierName: "earlier.pdf",
        newerName: "newer.pdf",
        pages: documentPages.map((entry) => ({
          ...entry,
          beforeSrc: "a",
          afterSrc: "b",
          diffSrc: "d",
          regions: [{ id: "r", x: 0, y: 0, width: 1, height: 1 }],
        })),
        comparePagePair: async () => documentPages[0]!,
      },
    }),
  );
  assert.doesNotMatch(html, /These pages may not match/);
  assert.doesNotMatch(html, /Temporary ·/);
  assert.doesNotMatch(html, /Return to document/);
});

test("a temporary mispair cue sits beside Return to document", () => {
  const html = renderToStaticMarkup(
    createElement(PairingControls, {
      page: page({ earlierPageNumber: 1, newerPageNumber: 5 }),
      pageIndex: 0,
      manual: true,
      cue: MISPAIR_CUE,
      canChangePair: true,
      onChangePair: () => undefined,
      onReturnToDocument: () => undefined,
    }),
  );
  assert.match(html, /Temporary · /);
  assert.match(html, /A 1 ↔ B 5/);
  assert.match(html, /Return to document/);
  assert.match(html, /role="status"/);
  assert.match(html, /These pages may not match/);
});

test("a temporary pair that looks fine keeps Return to document and stays quiet", () => {
  const html = renderToStaticMarkup(
    createElement(PairingControls, {
      page: page({ earlierPageNumber: 1, newerPageNumber: 1 }),
      pageIndex: 0,
      manual: true,
      cue: null,
      canChangePair: true,
      onChangePair: () => undefined,
      onReturnToDocument: () => undefined,
    }),
  );
  assert.match(html, /Temporary · /);
  assert.match(html, /Return to document/);
  assert.doesNotMatch(html, /These pages may not match/);
});
