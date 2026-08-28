import assert from "node:assert/strict";
import { test } from "node:test";
import { diffSemanticPages, diffSemanticText, type PageText } from "@pdfdiff/core";

test("semantic diff ignores whitespace reflow", () => {
  const result = diffSemanticText("The quick\n brown fox.", "The  quick brown fox.");
  assert.equal(result.changes.length, 0);
  assert.equal(result.before.map((run) => run.text).join(""), "The quick brown fox.");
});

test("semantic diff groups replacements and preserves unchanged text", () => {
  const result = diffSemanticText(
    "Payment is due within 30 days.",
    "Payment is due within 45 days.",
  );
  assert.deepEqual(result.changes, [{
    id: "semantic-2",
    kind: "changed",
    before: "30",
    after: "45",
  }]);
  assert.equal(result.before.find((run) => run.kind === "changed")?.text, "30");
  assert.equal(result.after.find((run) => run.kind === "changed")?.text, "45");
});

test("semantic diff distinguishes insertions and deletions", () => {
  const result = diffSemanticText("Alpha beta.", "Alpha new beta!");
  assert.deepEqual(result.changes.map(({ kind, before, after }) => ({ kind, before, after })), [
    { kind: "added", before: "", after: "new" },
    { kind: "changed", before: ".", after: "!" },
  ]);
});

test("semantic diff handles empty pages", () => {
  const added = diffSemanticText("", "New page");
  assert.equal(added.hasBeforeText, false);
  assert.equal(added.hasAfterText, true);
  assert.equal(added.changes[0]?.kind, "added");
  assert.equal(added.changes[0]?.after, "New page");
});

test("page semantic diff maps changes back to native text quads", () => {
  const item = (text: string, start: number, end: number): PageText["items"][number] => ({
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
  });
  const before: PageText = {
    pageNumber: 1,
    width: 200,
    height: 100,
    items: [item("Payment is due within 30 days.", 0, 31)],
    text: "Payment is due within 30 days.",
    hasText: true,
  };
  const after: PageText = {
    ...before,
    items: [item("Payment is due within 45 days.", 0, 31)],
    text: "Payment is due within 45 days.",
  };

  const result = diffSemanticPages(before, after);
  assert.equal(result.changes[0]?.before, "30");
  assert.equal(result.changes[0]?.after, "45");
  assert.equal(result.beforeOverlays[0]?.quads.length, 1);
  assert.equal(result.afterOverlays[0]?.quads.length, 1);
  assert.ok((result.beforeOverlays[0]?.quads[0]?.[0].x ?? 0) > 0);
  assert.ok((result.beforeOverlays[0]?.quads[0]?.[1].x ?? 0) > (result.beforeOverlays[0]?.quads[0]?.[0].x ?? 0));
});
