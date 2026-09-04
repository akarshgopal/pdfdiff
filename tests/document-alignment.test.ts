import assert from "node:assert/strict";
import { test } from "node:test";
import { alignPages, fingerprintPage, pageSimilarity, type AlignedPagePair } from "@pdfdiff/core";

function pages(...texts: readonly string[]) {
  return texts.map((text, index) => fingerprintPage(text, index + 1));
}

function shape(pairs: readonly AlignedPagePair[]): string[] {
  return pairs.map((pair) => `${pair.earlierPageNumber ?? "-"}${pair.kind === "matched" ? "=" : pair.kind === "moved" ? "~" : ">"}${pair.newerPageNumber ?? "-"}`);
}

const TERMS = "Term of contract effective date expiration obligations fulfilled";
const DUTIES = "Contractor duties perform the services specified in the attached exhibit";
const PAYMENT = "Consideration and payment invoices submitted according to schedule";
const NOTICES = "Notices to the parties shall be delivered to the addresses below";
const NEW_PAGE = "Amendment recitals whereas the parties wish to extend the agreement";

test("identical documents align one to one", () => {
  const pairs = alignPages(pages(TERMS, DUTIES, PAYMENT), pages(TERMS, DUTIES, PAYMENT));
  assert.deepEqual(shape(pairs), ["1=1", "2=2", "3=3"]);
  assert.ok(pairs.every((pair) => pair.similarity === 1));
});

test("an inserted page shifts the rest instead of rewriting every later page", () => {
  const pairs = alignPages(pages(TERMS, DUTIES, PAYMENT), pages(TERMS, NEW_PAGE, DUTIES, PAYMENT));
  assert.deepEqual(shape(pairs), ["1=1", "->2", "2=3", "3=4"]);
  assert.equal(pairs[1]!.kind, "added");
});

test("a removed page is reported once and the survivors stay paired", () => {
  const pairs = alignPages(pages(TERMS, DUTIES, PAYMENT, NOTICES), pages(TERMS, PAYMENT, NOTICES));
  assert.deepEqual(shape(pairs), ["1=1", "2>-", "3=2", "4=3"]);
  assert.equal(pairs[1]!.kind, "removed");
});

test("an edited page still pairs with its original rather than splitting", () => {
  const edited = `${TERMS} amended to twenty four months`;
  const pairs = alignPages(pages(TERMS, DUTIES), pages(edited, DUTIES));
  assert.deepEqual(shape(pairs), ["1=1", "2=2"]);
  assert.ok(pairs[0]!.similarity > 0.5 && pairs[0]!.similarity < 1);
});

test("a page moved to a new position is reported as moved, not as a delete plus insert", () => {
  const pairs = alignPages(pages(TERMS, NOTICES, DUTIES, PAYMENT), pages(TERMS, DUTIES, PAYMENT, NOTICES));
  const moved = pairs.filter((pair) => pair.kind === "moved");
  assert.equal(moved.length, 1);
  assert.deepEqual({ from: moved[0]!.earlierPageNumber, to: moved[0]!.newerPageNumber }, { from: 2, to: 4 });
  assert.equal(pairs.filter((pair) => pair.kind === "added" || pair.kind === "removed").length, 0);
});

test("move detection can be switched off", () => {
  const earlier = pages(TERMS, NOTICES, DUTIES, PAYMENT);
  const newer = pages(TERMS, DUTIES, PAYMENT, NOTICES);
  const pairs = alignPages(earlier, newer, { detectMoves: false });
  assert.equal(pairs.filter((pair) => pair.kind === "moved").length, 0);
  assert.equal(pairs.filter((pair) => pair.kind === "removed").length, 1);
  assert.equal(pairs.filter((pair) => pair.kind === "added").length, 1);
});

test("an empty document yields only additions or only removals", () => {
  assert.deepEqual(shape(alignPages([], pages(TERMS, DUTIES))), ["->1", "->2"]);
  assert.deepEqual(shape(alignPages(pages(TERMS, DUTIES), [])), ["1>-", "2>-"]);
  assert.deepEqual(alignPages([], []), []);
});

test("a wholly replaced page pairs anyway so the reviewer still gets a diff", () => {
  const pairs = alignPages(pages(TERMS, DUTIES), pages(TERMS, NEW_PAGE));
  assert.deepEqual(shape(pairs), ["1=1", "2=2"]);
  assert.ok(pairs[1]!.similarity < 0.3);
});

test("similarity ignores word order and repetition", () => {
  const first = fingerprintPage("alpha beta gamma", 1);
  const second = fingerprintPage("gamma beta alpha alpha alpha", 1);
  assert.equal(pageSimilarity(first, second), 1);
});

test("pages without extractable text neither match nor derail the alignment", () => {
  const scanned = fingerprintPage("", 2);
  assert.equal(scanned.tokenCount, 0);
  assert.equal(pageSimilarity(scanned, fingerprintPage(TERMS, 2)), 0);
  assert.equal(pageSimilarity(scanned, fingerprintPage("", 2)), 1);
});

test("alignment survives an insertion near the start of a long document", () => {
  const body = Array.from({ length: 40 }, (_, index) => `section ${index} clause text about obligation number ${index}`);
  const earlier = pages(...body);
  const newer = pages(body[0]!, NEW_PAGE, ...body.slice(1));
  const pairs = alignPages(earlier, newer);
  assert.equal(pairs.filter((pair) => pair.kind === "added").length, 1);
  assert.equal(pairs.filter((pair) => pair.kind === "removed").length, 0);
  const matched = pairs.filter((pair) => pair.kind === "matched");
  assert.equal(matched.length, 40);
  assert.ok(matched.every((pair) => pair.similarity === 1));
});

test("sequential pairing ignores content and pairs by position", () => {
  const pairs = alignPages(pages(TERMS, NEW_PAGE), pages(NEW_PAGE, TERMS, TERMS), { sequential: true });
  assert.deepEqual(pairs.map((pair) => [pair.earlierPageNumber, pair.newerPageNumber, pair.kind]), [
    [1, 1, "matched"],
    [2, 2, "matched"],
    [undefined, 3, "added"],
  ]);
});

test("dot leaders do not fuse into the word in front of them", () => {
  // Two revisions of one table of contents: same entries, re-flowed leaders.
  const earlier = fingerprintPage("1 Features .............. 1  8 Detailed Description ..... 9", 1);
  const newer = fingerprintPage("1 Features......................1  8 Detailed Description.........8", 1);

  assert.ok(earlier.tokens.has("features"), "the leader must not be part of the word");
  assert.ok(newer.tokens.has("features"));
  assert.ok(earlier.tokens.has("description") && newer.tokens.has("description"));
  // Left fused, these two pages share almost nothing and align as unrelated.
  assert.ok(pageSimilarity(earlier, newer) > 0.7, "contents pages must still read as the same page");
});

test("a decimal stays inside its word, and trailing punctuation does not", () => {
  const tokens = fingerprintPage("Section 5.1 covers 3.3V and SCES131I. See and/or the note-", 1).tokens;

  assert.ok(tokens.has("5.1"));
  assert.ok(tokens.has("3.3v"));
  assert.ok(tokens.has("and/or"));
  assert.ok(tokens.has("sces131i"), "the sentence period is not part of the part number");
  assert.ok(tokens.has("note"));
});
