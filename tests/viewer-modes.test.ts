import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  adjacentChangedPageIndex,
  buildPreviewPage,
  modeNeedsComparedPair,
  PdfDiffViewer,
  type DiffPage,
  type DiffViewMode,
} from "@pdfdiff/viewer-react";
import { helpModes, helpShortcuts, helpSteps } from "../packages/viewer-react/src/help-content.ts";

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

const comparedModes: DiffViewMode[] = ["diff", "semantic-text", "swipe"];
const directModes: DiffViewMode[] = ["side-by-side"];

function assertComparedPreview(mode: DiffViewMode): void {
  const preview = buildPreviewPage({ mode, currentPage, earlierPage, newerPage, comparisonPairPage });
  assert.ok(preview);
  assert.equal(preview.beforeSrc, "pair-a", `${mode} earlier source`);
  assert.equal(preview.afterSrc, "pair-b", `${mode} newer source`);
  assert.equal(preview.diffSrc, "pair-diff", `${mode} diff source`);
  assert.equal(preview.regions?.[0]?.id, "pair-region", `${mode} regions`);
  assert.equal(preview.textChanges?.[0]?.id, "pair-text", `${mode} semantic changes`);
}

test("all modes declare whether they need a normalized selected-page pair", () => {
  for (const mode of comparedModes) assert.equal(modeNeedsComparedPair(mode), true, mode);
  for (const mode of directModes) assert.equal(modeNeedsComparedPair(mode), false, mode);
});

test("Diff, Semantic, and Swipe use the exact normalized A/B pair", () => {
  for (const mode of comparedModes) assertComparedPreview(mode);
});

test("Side-by-side uses independently selected originals", () => {
  for (const mode of directModes) {
    const preview = buildPreviewPage({ mode, currentPage, earlierPage, newerPage, comparisonPairPage });
    assert.equal(preview?.beforeSrc, "selected-a", `${mode} earlier source`);
    assert.equal(preview?.afterSrc, "selected-b", `${mode} newer source`);
  }
});

test("an unresolved pair cannot leak stale diff or semantic metadata", () => {
  for (const mode of comparedModes) {
    const preview = buildPreviewPage({ mode, currentPage, earlierPage, newerPage, comparisonPairPage: null });
    assert.equal(preview?.beforeSrc, "selected-a", `${mode} pending earlier source`);
    assert.equal(preview?.afterSrc, "selected-b", `${mode} pending newer source`);
    assert.equal(preview?.diffSrc, undefined, `${mode} stale diff`);
    assert.deepEqual(preview?.regions, [], `${mode} stale regions`);
    assert.deepEqual(preview?.textChanges, [], `${mode} stale semantic changes`);
    assert.equal(preview?.status, "processing", `${mode} pending status`);
  }
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

test("viewer guidance names the four primary views and source A/B navigation", () => {
  assert.deepEqual(helpModes.map(([name]) => name), ["Overlay", "Split", "Swipe", "Text", "Source A / Source B"]);
  assert.equal(helpSteps[1]?.copy.includes("Overlay, Split, Swipe, or Text"), true);
  assert.deepEqual(helpShortcuts.find(([shortcut]) => shortcut === "1–4"), ["1–4", "Overlay, Split, Swipe, Text"]);
  assert.deepEqual(helpShortcuts.find(([shortcut]) => shortcut === "Shift + ← →"), ["Shift + ← →", "Source A pages"]);
  assert.deepEqual(helpShortcuts.find(([shortcut]) => shortcut === "Ctrl/Cmd + ← →"), ["Ctrl/Cmd + ← →", "Source B pages"]);
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
  assert.doesNotMatch(html, /change inspector/i);
  assert.doesNotMatch(html, /View options/);
  assert.doesNotMatch(html, /Change position/);
  assert.doesNotMatch(html, />Changes found<\/span>/);
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
  assert.match(html, />⚠ Text unavailable<\/span>/);
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
  assert.match(html, /Hide reflow noise/);
  assert.match(html, /Only changed pages/);
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
  assert.match(html, /Comparing pages · 0 of 3 complete/);
});
