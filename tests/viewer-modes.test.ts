import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  adjacentChangedPageIndex,
  buildPreviewPage,
  canDownloadPageImage,
  clampZoom,
  defaultViewMode,
  pageImageFileName,
  qualityForZoom,
  modeNeedsComparedPair,
  PdfDiffViewer,
  type DiffPage,
  } from "@pdfdiff/viewer-react";

const currentPage: DiffPage = {
  index: 0,
  beforeSrc: "current-a",
  afterSrc: "current-b",
  diffSrc: "current-diff",
  status: "changed",
  changedPixels: 10,
  regions: [{ id: "current-region", x: 0, y: 0, width: 1, height: 1 }],
};

const earlierPage: DiffPage = { index: 1, beforeSrc: "selected-a", status: "same" };
const newerPage: DiffPage = { index: 3, afterSrc: "selected-b", status: "same" };
const comparisonPairPage: DiffPage = {
  index: 1,
  beforeSrc: "pair-a",
  afterSrc: "pair-b",
  diffSrc: "pair-diff",
  status: "changed",
  changedPixels: 20,
  regions: [{ id: "pair-region", x: 0, y: 0, width: 1, height: 1 }],
  textChanges: [{ id: "pair-text", text: "changed", kind: "changed" }],
};

test("a resolved pair supplies the exact normalized A/B sources", () => {
  const preview = buildPreviewPage({ currentPage, earlierPage, newerPage, comparisonPairPage });
  assert.equal(preview?.beforeSrc, "pair-a");
  assert.equal(preview?.afterSrc, "pair-b");
  assert.equal(preview?.diffSrc, "pair-diff");
  assert.equal(preview?.regions?.[0]?.id, "pair-region");
  assert.equal(preview?.textChanges?.[0]?.id, "pair-text");
});

test("an unresolved pair falls back to the selected originals without leaking stale metadata", () => {
  const preview = buildPreviewPage({ currentPage, earlierPage, newerPage, comparisonPairPage: null });
  assert.equal(preview?.beforeSrc, "selected-a");
  assert.equal(preview?.afterSrc, "selected-b");
  assert.equal(preview?.diffSrc, undefined);
  assert.deepEqual(preview?.regions, []);
  assert.deepEqual(preview?.textChanges, []);
  assert.equal(preview?.status, "processing");
  assert.equal(modeNeedsComparedPair("swipe"), true, "so Swipe waits for the pair");
  assert.equal(modeNeedsComparedPair("side-by-side"), false, "while Split shows the originals now");
});

test("changed-page navigation wraps in either direction and ignores unchanged pages", () => {
  const pages: DiffPage[] = [
    { index: 0, status: "same" },
    { index: 1, status: "changed" },
    { index: 2, status: "same" },
    { index: 3, status: "added" },
  ];
  assert.equal(adjacentChangedPageIndex(pages, 1, 1), 3);
  assert.equal(adjacentChangedPageIndex(pages, 3, 1), 1);
  assert.equal(adjacentChangedPageIndex(pages, 1, -1), 3);
  assert.equal(adjacentChangedPageIndex([{ index: 0, status: "same" }], 0, 1), 0);
});

test("the opening view is the one that reads: Text when both sides carry comparable text", () => {
  const withText = (over: Partial<NonNullable<DiffPage["semantic"]>> = {}) => ({
    before: [], after: [], changes: [], beforeOverlays: [], afterOverlays: [],
    beforeTokenCount: 4, afterTokenCount: 5, hasBeforeText: true, hasAfterText: true, ...over,
  });
  assert.equal(defaultViewMode([{ index: 0, status: "changed", semantic: withText() }]), "semantic-text");
  // A scan has pixels and no text, so overlaying the rasters is all there is.
  assert.equal(defaultViewMode([{ index: 0, status: "changed" }]), "diff");
  // Glyph codes with no Unicode mapping extract as noise, which is worse than the overlay.
  assert.equal(defaultViewMode([{ index: 0, status: "changed", semantic: withText({ textUndecodable: true }) }]), "diff");
  // One side blank means there is nothing to diff against.
  assert.equal(defaultViewMode([{ index: 0, status: "added", semantic: withText({ hasBeforeText: false }) }]), "diff");
});

test("viewer renders unified A/B navigation, overlay thumbnails, and a pannable canvas", () => {
  const html = renderToStaticMarkup(createElement(PdfDiffViewer, {
    comparison: {
      earlierName: "earlier.pdf",
      newerName: "newer.pdf",
      pages: [{ ...currentPage, changedPercent: 7.33 }, { index: 1, status: "same", beforeSrc: "second-a", afterSrc: "second-b" }],
    },
  }));

  assert.match(html, /aria-label="Independent PDF page navigation"/);
  assert.match(html, /Previous source A page/);
  assert.match(html, /Next source B page/);
  assert.match(html, /Comparison overlay preview/);
  assert.match(html, /Document canvas\. Scroll to zoom and drag to pan\./);
  assert.match(html, /aria-label="Overlay colours"/);
  assert.match(html, />Added<\/span>.*>Removed<\/span>.*>Modified<\/span>/);
});

test("single-page unreadable comparisons remove duplicate chrome and retain the warning", () => {
  const html = renderToStaticMarkup(createElement(PdfDiffViewer, {
    comparison: {
      earlierName: "earlier.pdf",
      newerName: "newer.pdf",
      pages: [{
        ...currentPage,
        regions: [
          { id: "graphic-1", x: 0, y: 0, width: 1, height: 1, changeClass: "graphic" },
          { id: "content-1", x: 2, y: 2, width: 1, height: 1, changeClass: "content" },
        ],
        changeClasses: { content: 1, graphic: 1, reflow: 0, formatting: 0 },
        semantic: {
          textUndecodable: true,
          before: [], after: [], changes: [], beforeOverlays: [], afterOverlays: [],
          beforeTokenCount: 0, afterTokenCount: 0, hasBeforeText: false, hasAfterText: false,
        },
      }],
    },
  }));

  assert.match(html, />1 page changed<\/strong>/);
  assert.match(html, /⚠ Text unavailable on 1 of 1 pages<\/span>/);
  assert.match(html, /disabled=""[^>]+title="Text comparison unavailable:[^"]+"/);
  assert.doesNotMatch(html, />2 visual changes<\/span>/);
  assert.doesNotMatch(html, />Content<\/span><strong>1<\/strong>/);
  assert.doesNotMatch(html, /Independent PDF page navigation/);
  assert.doesNotMatch(html, /This PDF&#x27;s text could not be decoded/);
});

test("the workspace opens with a document-level summary and filters", () => {
  const html = renderToStaticMarkup(createElement(PdfDiffViewer, {
    comparison: {
      earlierName: "earlier.pdf",
      newerName: "newer.pdf",
      pages: [
        { ...currentPage, changeClasses: { content: 2, reflow: 9, formatting: 0, graphic: 1 }, noticeable: true, textChangeCount: 2 },
        { index: 1, status: "same", beforeSrc: "b", afterSrc: "a" },
      ],
    },
  }));

  assert.match(html, /aria-label="Comparison summary"/);
  assert.match(html, /1 changed of 2 pages/);
  assert.doesNotMatch(html, /2 text changes/);
  assert.doesNotMatch(html, /9 reflow\/formatting/);
  // The filters moved behind the settings dialog, so the resting workspace shows neither.
  assert.doesNotMatch(html, /Hide reflow noise/);
  assert.doesNotMatch(html, /Only changed pages/);
  assert.match(html, /aria-label="Settings"/);
});

test("a comparison whose only changes are reflow reports no substantive changes", () => {
  const html = renderToStaticMarkup(createElement(PdfDiffViewer, {
    comparison: {
      earlierName: "earlier.pdf",
      newerName: "newer.pdf",
      pages: [{ ...currentPage, status: "changed", noticeable: false, changeClasses: { content: 0, reflow: 6, formatting: 1, graphic: 0 } }],
    },
  }));

  assert.match(html, /No substantive changes/);
});

test("viewer renders supplied header actions in the comparison workspace", () => {
  const html = renderToStaticMarkup(createElement(PdfDiffViewer, {
    comparison: {
      earlierName: "earlier.pdf",
      newerName: "newer.pdf",
      pages: [{ ...currentPage }],
    },
    headerActions: createElement("button", { type: "button", "aria-label": "Toggle dark mode" }, "theme"),
  }));

  assert.match(html, /aria-label="Toggle dark mode"/);
});

test("viewer renders document counts and progress without treating pending pages as changes", () => {
  const html = renderToStaticMarkup(createElement(PdfDiffViewer, {
    comparison: {
      earlierName: "earlier.pdf",
      newerName: "newer.pdf",
      earlierPageCount: 3,
      newerPageCount: 2,
      pages: [
        { index: 0, status: "processing" },
        { index: 1, status: "processing" },
        { index: 2, status: "processing" },
      ],
    },
    processingProgress: { completed: 0, total: 3 },
  }));

  assert.match(html, /A<\/span><strong>1 \/ 3/);
  assert.match(html, /B<\/span><strong>1 \/ 2/);
  assert.doesNotMatch(html, />Changed <span>/);
  assert.doesNotMatch(html, /The documents are identical/);
  assert.match(html, /Comparing 0 of 3 pages…/);
  assert.match(html, /Comparing page 1 of 3/);
  assert.match(html, /role="progressbar"[^>]+aria-valuenow="0"/);
  assert.doesNotMatch(html, /<p>Preview is still rendering/);
  assert.doesNotMatch(html, /No selectable text/);
});

test("the marked-up page can leave the tab, named after both sources and the pages it pairs", () => {
  const comparison = { earlierName: "Wheel Hub Rev A.pdf", newerName: "Wheel Hub Rev B.pdf", pages: [] };
  const named = (page: DiffPage) => pageImageFileName(comparison, page);

  assert.equal(named({ index: 0, earlierPageNumber: 3, newerPageNumber: 3 }), "Wheel-Hub-Rev-A-vs-Wheel-Hub-Rev-B-page-3.png");
  assert.equal(named({ index: 0, earlierPageNumber: 3, newerPageNumber: 5 }), "Wheel-Hub-Rev-A-vs-Wheel-Hub-Rev-B-page-A3-B5.png", "a moved page names both sides");
  assert.equal(named({ index: 0, earlierPageNumber: 2 }), "Wheel-Hub-Rev-A-vs-Wheel-Hub-Rev-B-page-A2.png", "a removed page");
  assert.equal(named({ index: 7 }), "Wheel-Hub-Rev-A-vs-Wheel-Hub-Rev-B-page-8.png", "falls back to the row number");
});

test("the image export is offered only once a page has a rendered overlay", () => {
  assert.equal(canDownloadPageImage(null), false);
  assert.equal(canDownloadPageImage({ index: 0, status: "processing" }), false, "a page still rendering has nothing to save");
  assert.equal(canDownloadPageImage({ index: 0, diffSrc: "blob:diff" }), true);
  assert.equal(canDownloadPageImage({ index: 0, layers: { base: "b", added: "a", removed: "r", modified: "m" } }), true, "layers alone are enough to compose an export");
});

test("keyboard and toolbar zoom stay inside the same bounds", () => {
  assert.equal(clampZoom(100 + 25), 125);
  assert.equal(clampZoom(25 - 25), 25);
  assert.equal(clampZoom(400 + 25), 400);
});

test("the high-resolution re-render follows the zoom, with a gap so a hovering wheel cannot thrash it", () => {
  assert.equal(qualityForZoom(100, "standard"), "standard");
  assert.equal(qualityForZoom(150, "standard"), "high", "close inspection asks for the sharper render");
  assert.equal(qualityForZoom(140, "high"), "high", "backing off a little keeps what was already rendered");
  assert.equal(qualityForZoom(125, "high"), "standard", "backing off past the lower bound releases it");
});
