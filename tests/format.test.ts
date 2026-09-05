import assert from "node:assert/strict";
import test from "node:test";
import { middleTruncate } from "../lib/format.ts";

test("middle truncation keeps both ends of a long file name", () => {
  assert.equal(middleTruncate("short.pdf"), "short.pdf");
  const long = "ti-sn74lv126a-rev-i-datasheet.pdf";
  const truncated = middleTruncate(long);
  assert.equal(truncated.length, 30);
  assert.ok(truncated.startsWith("ti-sn74lv126a-r"));
  assert.ok(truncated.endsWith("datasheet.pdf"));
  assert.equal(middleTruncate("a".repeat(30)), "a".repeat(30));
});
