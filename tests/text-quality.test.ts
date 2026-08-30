import assert from "node:assert/strict";
import { test } from "node:test";
import { decodableRatio, diffSemanticPages, isDecodableText, stripUndecodable, type PageText } from "@pdfdiff/core";

/** What a subset font with no ToUnicode map yields: glyph indices, not characters. */
const GLYPH_CODES = "\u0001\u0002\u0001\u0001\u0001\n\u0001\u0002\u0003\u0004\n\u0005\u0006\u0007\u0008";

function page(text: string, overrides: Partial<PageText> = {}): PageText {
  return { pageNumber: 1, width: 612, height: 792, items: [], text, hasText: text.length > 0, ...overrides };
}

test("ordinary text is fully decodable", () => {
  assert.equal(decodableRatio("WHEEL HUB - REV A, 0.157 THRU"), 1);
  assert.equal(isDecodableText("WHEEL HUB"), true);
});

test("glyph codes are detected as undecodable", () => {
  assert.ok(decodableRatio(GLYPH_CODES) < 0.2);
  assert.equal(isDecodableText(GLYPH_CODES), false);
});

test("private-use glyphs and replacement characters count as undecodable", () => {
  assert.equal(isDecodableText("\uFFFD\uFFFD\uFFFD\uFFFD"), false, "replacement characters");
  assert.equal(isDecodableText("\uE000\uE001\uE002\uE003"), false, "private use area");
});

test("empty or whitespace-only text is decodable, since there is nothing to decode", () => {
  assert.equal(decodableRatio(""), 1);
  assert.equal(decodableRatio("   \n\t "), 1);
  assert.equal(isDecodableText(""), true);
});

test("tabs and newlines are not mistaken for undecodable characters", () => {
  assert.equal(decodableRatio("REV A\tREV B\r\nSHEET 1 OF 1"), 1);
});

test("a mostly-readable page still passes", () => {
  const mostlyFine = "SolidWorks Student License Academic Use Only WHEEL HUB REV A\u0001";
  assert.ok(decodableRatio(mostlyFine) > 0.9);
  assert.equal(isDecodableText(mostlyFine), true);
});

test("the threshold is adjustable", () => {
  const half = "ab\u0001\u0002";
  assert.equal(decodableRatio(half), 0.5);
  assert.equal(isDecodableText(half, 0.4), true);
  assert.equal(isDecodableText(half, 0.75), false);
});

test("stripUndecodable removes glyph codes and keeps real words", () => {
  assert.equal(stripUndecodable("WHEEL\u0001 \u0002HUB"), "WHEEL HUB");
});

test("a page diff over undecodable text reports that, instead of reporting no changes", () => {
  const diff = diffSemanticPages(page(GLYPH_CODES, { decodable: false }), page(GLYPH_CODES + "\u0009", { decodable: false }));
  assert.equal(diff.textUndecodable, true);
  assert.equal(diff.hasBeforeText, false);
  assert.equal(diff.hasAfterText, false);
  assert.equal(diff.beforeTokenCount, 0, "glyph codes must not be counted as words");
  assert.equal(diff.afterTokenCount, 0);
});

test("undecodable text is detected even when the extractor did not flag it", () => {
  const diff = diffSemanticPages(page(GLYPH_CODES), page(GLYPH_CODES));
  assert.equal(diff.textUndecodable, true);
});

test("readable pages are unaffected and still diff normally", () => {
  const diff = diffSemanticPages(page("Effective date: 30 days"), page("Effective date: 60 days"));
  assert.notEqual(diff.textUndecodable, true);
  assert.equal(diff.hasBeforeText, true);
  assert.ok(diff.beforeTokenCount > 0);
  assert.ok(diff.changes.length > 0);
});
