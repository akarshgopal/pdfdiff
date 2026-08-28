import assert from "node:assert/strict";
import { test } from "node:test";
import { diffSemanticText } from "../lib/pdfdiff/semantic.ts";

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
