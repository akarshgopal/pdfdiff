import assert from "node:assert/strict";
import { test } from "node:test";
import { diffSemanticPages, diffSemanticText, type PageText } from "@pdfdiff/core";

test("semantic diff ignores whitespace reflow", () => {
  const result = diffSemanticText("The quick\n brown fox.", "The  quick brown fox.");
  assert.equal(result.changes.length, 0);
  assert.equal(result.before.map((run) => run.text).join(""), "The quick brown fox.");
});

test("semantic diff groups replacements and preserves unchanged text", () => {
  const result = diffSemanticText("Payment is due within 30 days.", "Payment is due within 45 days.");
  assert.deepEqual(result.changes, [
    {
      id: "semantic-2",
      kind: "changed",
      before: "30",
      after: "45",
    },
  ]);
  assert.equal(result.before.find((run) => run.kind === "changed")?.text, "30");
  assert.equal(result.after.find((run) => run.kind === "changed")?.text, "45");
});

test("semantic diff distinguishes insertions and deletions", () => {
  const result = diffSemanticText("Alpha beta.", "Alpha new beta!");
  assert.deepEqual(
    result.changes.map(({ kind, before, after }) => ({ kind, before, after })),
    [
      { kind: "added", before: "", after: "new" },
      { kind: "changed", before: ".", after: "!" },
    ],
  );
});

test("semantic diff handles empty pages", () => {
  const added = diffSemanticText("", "New page");
  assert.equal(added.hasBeforeText, false);
  assert.equal(added.hasAfterText, true);
  assert.equal(added.changes[0]?.kind, "added");
  assert.equal(added.changes[0]?.after, "New page");
});

test("semantic diff keeps unrelated long pages as removed and added", () => {
  const before = Array.from({ length: 600 }, (_, index) => `old${index}`).join(" ");
  const after = Array.from({ length: 600 }, (_, index) => `new${index}`).join(" ");
  const result = diffSemanticText(before, after);

  assert.deepEqual(
    result.changes.map((change) => change.kind),
    ["removed", "added"],
  );
  assert.equal(result.changes[0]?.before, before);
  assert.equal(result.changes[0]?.after, "");
  assert.equal(result.changes[1]?.before, "");
  assert.equal(result.changes[1]?.after, after);
});

function textItem(text: string, start: number, end: number): PageText["items"][number] {
  return {
    pageNumber: 1,
    str: text,
    textStart: start,
    textEnd: end,
    dir: "ltr",
    fontName: "font",
    width: text.length * 10,
    height: 12,
    fontSize: 12,
    hasEOL: false,
    transform: [1, 0, 0, 1, start * 10, 20],
    bounds: { x: start * 10, y: 8, width: text.length * 10, height: 12 },
    quad: [
      { x: start * 10, y: 8 },
      { x: end * 10, y: 8 },
      { x: end * 10, y: 20 },
      { x: start * 10, y: 20 },
    ],
  };
}

test("page semantic diff maps changes back to native text quads", () => {
  const before: PageText = {
    pageNumber: 1,
    width: 200,
    height: 100,
    items: [textItem("Payment is due within 30 days.", 0, 31)],
    text: "Payment is due within 30 days.",
    hasText: true,
  };
  const after: PageText = {
    ...before,
    items: [textItem("Payment is due within 45 days.", 0, 31)],
    text: "Payment is due within 45 days.",
  };

  const result = diffSemanticPages(before, after);
  const change = result.changes[0];
  const beforeQuad = result.beforeOverlays[0]?.quads[0];
  const afterQuad = result.afterOverlays[0]?.quads[0];
  assert.ok(change && beforeQuad && afterQuad);
  assert.equal(change.before, "30");
  assert.equal(change.after, "45");
  assert.equal(result.beforeOverlays[0]!.quads.length, 1);
  assert.equal(result.afterOverlays[0]!.quads.length, 1);
  assert.ok(beforeQuad[0].x > 0);
  assert.ok(beforeQuad[1].x > beforeQuad[0].x);
});

function spatialItem(text: string, x: number, y: number, start: number): PageText["items"][number] {
  const width = Math.max(8, text.length * 5);
  return {
    pageNumber: 1,
    str: text,
    textStart: start,
    textEnd: start + text.length,
    dir: "ltr",
    fontName: "font",
    width,
    height: 10,
    fontSize: 10,
    hasEOL: true,
    transform: [1, 0, 0, 1, x, y],
    bounds: { x, y, width, height: 10 },
    quad: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + 10 },
      { x, y: y + 10 },
    ],
  };
}

function rotatedItem(text: string, x: number, y: number, start: number): PageText["items"][number] {
  const item = spatialItem(text, x, y, start);
  const height = item.bounds.width;
  return {
    ...item,
    width: height,
    bounds: { x, y, width: 10, height },
    quad: [
      { x, y },
      { x, y: y + height },
      { x: x + 10, y: y + height },
      { x: x + 10, y },
    ],
  };
}

test("page semantic diff matches reordered spatial lines before diffing their words", () => {
  const before: PageText = {
    pageNumber: 1,
    width: 600,
    height: 800,
    items: [
      spatialItem("Footer reference", 40, 740, 0),
      spatialItem("Payment is due within 30 days.", 40, 120, 17),
      spatialItem("Terms and conditions", 320, 120, 48),
    ],
    text: "Footer reference\nPayment is due within 30 days.\nTerms and conditions",
    hasText: true,
  };
  const after: PageText = {
    ...before,
    items: [
      spatialItem("Terms and conditions", 40, 90, 0),
      spatialItem("Footer reference", 40, 760, 21),
      spatialItem("Payment is due within 45 days.", 40, 140, 38),
    ],
    text: "Terms and conditions\nFooter reference\nPayment is due within 45 days.",
  };

  const result = diffSemanticPages(before, after);
  assert.deepEqual(
    result.changes.map(({ kind, before: oldText, after: newText }) => ({ kind, oldText, newText })),
    [{ kind: "changed", oldText: "30", newText: "45" }],
  );
  assert.equal(result.beforeOverlays.length, 1);
  assert.equal(result.afterOverlays.length, 1);
});

test("page semantic diff ignores case, hyphen, and unit-spacing restyling", () => {
  const beforeText = "2-V to 5.5-V VCC Operation";
  const afterText = "2V to 5.5V VCC operation";
  const before: PageText = {
    pageNumber: 1,
    width: 600,
    height: 800,
    items: [spatialItem(beforeText, 40, 120, 0)],
    text: beforeText,
    hasText: true,
  };
  const after: PageText = {
    pageNumber: 1,
    width: 600,
    height: 800,
    items: [spatialItem(afterText, 40, 120, 0)],
    text: afterText,
    hasText: true,
  };

  const result = diffSemanticPages(before, after);
  assert.equal(result.changes.length, 0);
  assert.equal(result.beforeOverlays.length, 0);
  assert.equal(result.afterOverlays.length, 0);
});

test("page semantic diff keeps technical punctuation meaningful", () => {
  const beforeText = "D+";
  const afterText = "D-";
  const before: PageText = {
    pageNumber: 1,
    width: 200,
    height: 100,
    items: [spatialItem(beforeText, 20, 20, 0)],
    text: beforeText,
    hasText: true,
  };
  const after: PageText = {
    pageNumber: 1,
    width: 200,
    height: 100,
    items: [spatialItem(afterText, 20, 20, 0)],
    text: afterText,
    hasText: true,
  };

  const result = diffSemanticPages(before, after);
  assert.deepEqual(
    result.changes.map(({ before: oldText, after: newText }) => ({ oldText, newText })),
    [{ oldText: "+", newText: "-" }],
  );
});

test("rotated drawing labels stay separate and ignore embedded glyph spacing", () => {
  const before: PageText = {
    pageNumber: 1,
    width: 200,
    height: 100,
    items: [rotatedItem("POWER", 20, 20, 0), spatialItem("R1", 20, 35, 5)],
    text: "POWER\nR1",
    hasText: true,
  };
  const after: PageText = {
    ...before,
    items: [rotatedItem("PO W ER", 25, 20, 0), spatialItem("R1", 20, 35, 7)],
    text: "PO W ER\nR1",
  };

  const result = diffSemanticPages(before, after);
  assert.equal(result.changes.length, 0);
  assert.equal(result.unchangedLines?.length, 2);
});
