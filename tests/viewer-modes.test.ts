import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPreviewPage,
  modeNeedsComparedPair,
  type DiffPage,
  type DiffViewMode,
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

const comparedModes: DiffViewMode[] = ["diff", "semantic-text", "swipe", "blink"];
const directModes: DiffViewMode[] = ["side-by-side", "earlier", "newer"];

test("all modes declare whether they need a normalized selected-page pair", () => {
  for (const mode of comparedModes) assert.equal(modeNeedsComparedPair(mode), true, mode);
  for (const mode of directModes) assert.equal(modeNeedsComparedPair(mode), false, mode);
});

test("Diff, Semantic, Swipe, and Blink use the exact normalized A/B pair", () => {
  for (const mode of comparedModes) {
    const preview = buildPreviewPage({ mode, currentPage, earlierPage, newerPage, comparisonPairPage });
    assert.equal(preview?.beforeSrc, "pair-a", `${mode} earlier source`);
    assert.equal(preview?.afterSrc, "pair-b", `${mode} newer source`);
    assert.equal(preview?.diffSrc, "pair-diff", `${mode} diff source`);
    assert.equal(preview?.regions?.[0]?.id, "pair-region", `${mode} regions`);
    assert.equal(preview?.textChanges?.[0]?.id, "pair-text", `${mode} semantic changes`);
  }
});

test("Side-by-side, Earlier, and Newer use independently selected originals", () => {
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
