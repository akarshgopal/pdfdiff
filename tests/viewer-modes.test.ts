import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  canDownloadPageImage,
  clampZoom,
  comparisonProgress,
  pageImageFileName,
  qualityForZoom,
  PdfDiffViewer,
  summaryHeadline,
  workspaceHeadline,
  type DiffPage,
} from "@pdfdiff/viewer-react";

type ComparisonSummary = Parameters<typeof summaryHeadline>[0];

const currentPage: DiffPage = {
  index: 0,
  beforeSrc: "current-a",
  afterSrc: "current-b",
  diffSrc: "current-diff",
  status: "changed",
  changedPixels: 10,
  regions: [{ id: "current-region", x: 0, y: 0, width: 1, height: 1 }],
};

test("viewer renders pair navigation, overlay thumbnails, and a pannable canvas", () => {
  const html = renderToStaticMarkup(
    createElement(PdfDiffViewer, {
      comparison: {
        earlierName: "earlier.pdf",
        newerName: "newer.pdf",
        pages: [
          { ...currentPage, changedPercent: 7.33 },
          { index: 1, status: "same", beforeSrc: "second-a", afterSrc: "second-b" },
        ],
      },
    }),
  );

  assert.match(html, /aria-label="Page navigation"/);
  assert.match(html, /aria-pressed="true"[^>]*>Overlay/);
  assert.doesNotMatch(html, /Independent PDF page navigation/);
  assert.match(html, /Previous page/);
  assert.match(html, /Next page/);
  assert.match(html, /Comparison overlay preview/);
  assert.match(html, /Document canvas\. Scroll to pan, pinch or Ctrl-scroll to zoom\./);
  assert.match(html, /aria-label="Overlay colours"/);
  assert.match(html, />Added<\/span>.*>Removed<\/span>.*>Modified<\/span>/);
});

test("single-page unreadable comparisons remove duplicate chrome and retain the warning", () => {
  const html = renderToStaticMarkup(
    createElement(PdfDiffViewer, {
      comparison: {
        earlierName: "earlier.pdf",
        newerName: "newer.pdf",
        pages: [
          {
            ...currentPage,
            regions: [
              { id: "graphic-1", x: 0, y: 0, width: 1, height: 1, changeClass: "graphic" },
              { id: "content-1", x: 2, y: 2, width: 1, height: 1, changeClass: "content" },
            ],
            changeClasses: { content: 1, graphic: 1, reflow: 0, formatting: 0 },
            semantic: {
              textUndecodable: true,
              before: [],
              after: [],
              changes: [],
              beforeOverlays: [],
              afterOverlays: [],
              beforeTokenCount: 0,
              afterTokenCount: 0,
              hasBeforeText: false,
              hasAfterText: false,
            },
          },
        ],
      },
    }),
  );

  assert.match(html, />1 page changed<\/strong>/);
  assert.match(html, /2 areas on this page/);
  assert.match(html, /⚠ Text unavailable on 1 of 1 pages<\/span>/);
  assert.match(html, /disabled=""[^>]+title="Text comparison unavailable:[^"]+"/);
  assert.doesNotMatch(html, />2 visual changes<\/span>/);
  assert.doesNotMatch(html, />Content<\/span><strong>1<\/strong>/);
  assert.doesNotMatch(html, /Independent PDF page navigation/);
  assert.doesNotMatch(html, /This PDF&#x27;s text could not be decoded/);
});

test("the workspace opens with a document-level summary and filters", () => {
  const html = renderToStaticMarkup(
    createElement(PdfDiffViewer, {
      comparison: {
        earlierName: "earlier.pdf",
        newerName: "newer.pdf",
        pages: [
          {
            ...currentPage,
            changeClasses: { content: 2, reflow: 9, formatting: 0, graphic: 1 },
            noticeable: true,
            textChangeCount: 2,
          },
          { index: 1, status: "same", beforeSrc: "b", afterSrc: "a" },
        ],
      },
    }),
  );

  assert.match(html, /aria-label="Comparison summary"/);
  assert.match(html, /1 of 2 pages changed/);
  assert.match(html, /1 area on this page/);
  assert.doesNotMatch(html, /1 changed of 2 pages/);
  assert.doesNotMatch(html, /1 change on this page/);
  assert.doesNotMatch(html, /2 text changes/);
  assert.doesNotMatch(html, /9 reflow\/formatting/);
  // The filters moved behind the settings dialog, so the resting workspace shows neither.
  assert.doesNotMatch(html, /Hide reflow noise/);
  assert.match(html, /Only changed/);
  assert.match(html, /aria-label="Settings"/);
});

test("a comparison with possible reflow still reports detected changes", () => {
  const html = renderToStaticMarkup(
    createElement(PdfDiffViewer, {
      comparison: {
        earlierName: "earlier.pdf",
        newerName: "newer.pdf",
        pages: [
          {
            ...currentPage,
            status: "changed",
            noticeable: false,
            changeClasses: { content: 0, reflow: 6, formatting: 1, graphic: 0 },
          },
        ],
      },
    }),
  );

  assert.match(html, /1 page changed/);
  assert.doesNotMatch(html, /No substantive changes/);
});

test("viewer renders supplied header actions in the comparison workspace", () => {
  const html = renderToStaticMarkup(
    createElement(PdfDiffViewer, {
      comparison: {
        earlierName: "earlier.pdf",
        newerName: "newer.pdf",
        pages: [{ ...currentPage }],
      },
      headerActions: createElement("button", { type: "button", "aria-label": "Toggle dark mode" }, "theme"),
    }),
  );

  assert.match(html, /aria-label="Toggle dark mode"/);
});

test("viewer renders document counts and progress without treating pending pages as changes", () => {
  const html = renderToStaticMarkup(
    createElement(PdfDiffViewer, {
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
    }),
  );

  assert.match(html, /Page navigation/);
  assert.doesNotMatch(html, />Changed <span>/);
  assert.doesNotMatch(html, /The documents are identical/);
  assert.match(html, /Comparing 0 of 3 pages…/);
  assert.match(html, /Comparing page 1 of 3/);
  assert.match(html, /role="progressbar"[^>]+aria-valuenow="0"/);
  assert.doesNotMatch(html, /No differences detected/);
  assert.doesNotMatch(html, /pages changed/);
  assert.doesNotMatch(html, /<p>Preview is still rendering/);
  assert.doesNotMatch(html, /No selectable text/);
});

test("a partially streamed comparison keeps the in-progress headline and muted rail chips", () => {
  const pages: DiffPage[] = [
    { ...currentPage, status: "changed" },
    { index: 1, status: "same", beforeSrc: "b", afterSrc: "a" },
    { index: 2, status: "processing" },
  ];
  const html = renderToStaticMarkup(
    createElement(PdfDiffViewer, {
      comparison: {
        earlierName: "earlier.pdf",
        newerName: "newer.pdf",
        earlierPageCount: 3,
        newerPageCount: 3,
        pages,
      },
      processingProgress: { completed: 2, total: 3 },
    }),
  );

  assert.match(html, /Comparing 2 of 3 pages…/);
  assert.match(html, /Comparing page 3 of 3/);
  assert.doesNotMatch(html, /1 of 3 pages changed/);
  assert.doesNotMatch(html, /No differences detected/);
  assert.match(html, />1 area</);
  assert.match(html, />No changes</);
  assert.match(html, />Comparing…</);
  assert.doesNotMatch(html, /text-success/);
});

test("pending rows keep the comparing headline even without a progress prop", () => {
  const html = renderToStaticMarkup(
    createElement(PdfDiffViewer, {
      comparison: {
        earlierName: "earlier.pdf",
        newerName: "newer.pdf",
        pages: [
          { ...currentPage, status: "changed" },
          { index: 1, status: "processing" },
        ],
      },
    }),
  );

  assert.match(html, /Comparing 1 of 2 pages…/);
  assert.doesNotMatch(html, /1 of 2 pages changed/);
  assert.doesNotMatch(html, /No differences detected/);
});

test("once every page has a verdict the page-story headline is stable", () => {
  const html = renderToStaticMarkup(
    createElement(PdfDiffViewer, {
      comparison: {
        earlierName: "earlier.pdf",
        newerName: "newer.pdf",
        pages: [
          { ...currentPage, status: "changed" },
          { index: 1, status: "same", beforeSrc: "b", afterSrc: "a" },
        ],
      },
      processingProgress: { completed: 2, total: 2 },
    }),
  );

  assert.match(html, /1 of 2 pages changed/);
  assert.doesNotMatch(html, /Comparing \d+ of \d+ pages/);
  assert.doesNotMatch(html, /role="progressbar"/);
  assert.match(html, /text-success/);
});

test("the marked-up page can leave the tab, named after both sources and the pages it pairs", () => {
  const comparison = { earlierName: "Wheel Hub Rev A.pdf", newerName: "Wheel Hub Rev B.pdf", pages: [] };
  const named = (page: DiffPage) => pageImageFileName(comparison, page);

  assert.equal(
    named({ index: 0, earlierPageNumber: 3, newerPageNumber: 3 }),
    "Wheel-Hub-Rev-A-vs-Wheel-Hub-Rev-B-page-3.png",
  );
  assert.equal(
    named({ index: 0, earlierPageNumber: 3, newerPageNumber: 5 }),
    "Wheel-Hub-Rev-A-vs-Wheel-Hub-Rev-B-page-A3-B5.png",
    "a moved page names both sides",
  );
  assert.equal(
    named({ index: 0, earlierPageNumber: 2 }),
    "Wheel-Hub-Rev-A-vs-Wheel-Hub-Rev-B-page-A2.png",
    "a removed page",
  );
  assert.equal(named({ index: 7 }), "Wheel-Hub-Rev-A-vs-Wheel-Hub-Rev-B-page-8.png", "falls back to the row number");
});

test("the image export is offered only once a page has a rendered overlay", () => {
  assert.equal(canDownloadPageImage(null), false);
  assert.equal(
    canDownloadPageImage({ index: 0, status: "processing" }),
    false,
    "a page still rendering has nothing to save",
  );
  assert.equal(canDownloadPageImage({ index: 0, diffSrc: "blob:diff" }), true);
  assert.equal(
    canDownloadPageImage({ index: 0, layers: { base: "b", added: "a", removed: "r", modified: "m" } }),
    true,
    "layers alone are enough to compose an export",
  );
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

// Source numbers and comparison rows diverge after insertions and moves.
test("page navigation uses source numbers and retains moved pages in the filter", async () => {
  const { pagePairNumbers, sourcePageCount, visiblePageIndexes } =
    await import("../packages/viewer-react/src/viewer-utils.ts");
  const pages: DiffPage[] = [
    { index: 0, earlierPageNumber: 1, newerPageNumber: 2, status: "same" },
    { index: 1, newerPageNumber: 1, status: "added" },
    { index: 2, earlierPageNumber: 2, newerPageNumber: 3, alignment: "moved", status: "same" },
    { index: 3, earlierPageNumber: 3, status: "removed" },
  ];
  assert.deepEqual(pagePairNumbers(pages[0]), { earlier: 1, newer: 2 });
  assert.deepEqual(pagePairNumbers(pages[1]), { earlier: undefined, newer: 1 });
  assert.equal(sourcePageCount(pages, "earlier"), 3);
  assert.deepEqual(visiblePageIndexes(pages, true, 1), [1, 2, 3]);
  assert.deepEqual(visiblePageIndexes(pages, true, 0), [0, 1, 2, 3]);
});

function summary(overrides: Partial<ComparisonSummary>): ComparisonSummary {
  return {
    pages: 1,
    changedPages: 0,
    addedPages: 0,
    removedPages: 0,
    movedPages: 0,
    noisePages: 0,
    textChanges: 0,
    classes: { content: 0, reflow: 0, formatting: 0, graphic: 0 },
    pagesWithoutText: 0,
    pagesWithUnreadableText: 0,
    ...overrides,
  };
}

test("the document headline is always a page story", () => {
  assert.equal(summaryHeadline(summary({ pages: 4 })), "No differences detected at current settings");
  assert.equal(summaryHeadline(summary({ pages: 1, changedPages: 1 })), "1 page changed");
  assert.equal(summaryHeadline(summary({ pages: 2, changedPages: 2 })), "2 pages changed");
  assert.equal(summaryHeadline(summary({ pages: 2, changedPages: 1 })), "1 of 2 pages changed");
  assert.equal(summaryHeadline(summary({ pages: 5, addedPages: 1 })), "1 of 5 pages added");
  assert.equal(
    summaryHeadline(summary({ pages: 5, changedPages: 2, addedPages: 1, removedPages: 1, movedPages: 1 })),
    "2 pages changed · 1 page added · 1 page removed · 1 page moved",
  );
  assert.doesNotMatch(
    summaryHeadline(
      summary({
        pages: 3,
        changedPages: 1,
        textChanges: 8,
        classes: { content: 2, reflow: 9, formatting: 0, graphic: 1 },
      }),
    ),
    /text change|reflow|token|area/i,
  );
});

test("document progress stays open until every page has a verdict", () => {
  const mixed: DiffPage[] = [
    { index: 0, status: "changed" },
    { index: 1, status: "same" },
    { index: 2, status: "processing" },
  ];
  assert.deepEqual(comparisonProgress(mixed, { completed: 2, total: 3 }), { completed: 2, total: 3 });
  assert.deepEqual(
    comparisonProgress(mixed),
    { completed: 2, total: 3 },
    "page status is enough without a progress prop",
  );
  assert.equal(
    comparisonProgress([
      { index: 0, status: "changed" },
      { index: 1, status: "same" },
    ]),
    undefined,
  );
  assert.equal(
    comparisonProgress(
      [
        { index: 0, status: "changed" },
        { index: 1, status: "same" },
      ],
      { completed: 2, total: 2 },
    ),
    undefined,
    "a leftover 2 of 2 report does not keep the document unsettled",
  );
  assert.deepEqual(comparisonProgress([], { completed: 0, total: 4 }), { completed: 0, total: 4 });

  const partial = summary({ pages: 3, changedPages: 1 });
  assert.equal(workspaceHeadline(partial, { completed: 2, total: 3 }), "Comparing 2 of 3 pages…");
  assert.equal(workspaceHeadline(partial), "1 of 3 pages changed");
});

// The rail label, the change counter, and next/previous all read one list, so
// Text mode can never claim a different number of changes than the view shows.
test("change navigation counts the list the current view highlights", async () => {
  const { pageChanges, statusText, changeWalkerLabel } = await import("../packages/viewer-react/src/viewer-utils.ts");
  const page: DiffPage = {
    index: 0,
    status: "changed",
    regions: [
      { id: "r1", x: 0, y: 0, width: 1, height: 1 },
      { id: "r2", x: 1, y: 1, width: 1, height: 1 },
      { id: "r3", x: 2, y: 2, width: 1, height: 1 },
    ],
    semantic: {
      before: [],
      after: [],
      changes: [
        { id: "t1", kind: "changed", before: "a", after: "b" },
        { id: "t2", kind: "added", before: "", after: "c" },
      ],
      beforeOverlays: [],
      afterOverlays: [],
      beforeTokenCount: 1,
      afterTokenCount: 1,
      hasBeforeText: true,
      hasAfterText: true,
    },
  };

  assert.deepEqual(
    pageChanges(page, "semantic-text").map((change) => change.id),
    ["t1", "t2"],
  );
  assert.deepEqual(
    pageChanges(page, "diff").map((change) => change.id),
    ["r1", "r2", "r3"],
  );
  assert.equal(statusText(page, "changed", "semantic-text"), "2 text changes");
  assert.equal(statusText(page, "changed", "diff"), "3 areas");
  assert.equal(statusText(page, "changed", "side-by-side"), "3 areas");
  assert.equal(statusText(page, "changed", "swipe"), "3 areas");
  assert.equal(statusText({ index: 1, status: "removed" }, "removed", "diff"), "Removed");

  assert.equal(changeWalkerLabel(12, -1, "diff"), "12 areas on this page");
  assert.equal(changeWalkerLabel(12, 2, "diff"), "Area 3 of 12 on this page");
  assert.equal(changeWalkerLabel(1, -1, "swipe"), "1 area on this page");
  assert.equal(changeWalkerLabel(8, -1, "semantic-text"), "8 text changes on this page");
  assert.equal(changeWalkerLabel(8, 1, "semantic-text"), "Text change 2 of 8 on this page");
  assert.equal(changeWalkerLabel(1, 0, "semantic-text"), "Text change 1 of 1 on this page");
});
