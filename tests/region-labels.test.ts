import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiffSemanticOverlay } from "@pdfdiff/viewer-react";
import { describeRegions, regionLabel } from "../app/pdfdiff/regionLabels.ts";

function overlay(id: string, kind: DiffSemanticOverlay["kind"], text: string, x: number, y: number, width: number, height: number): DiffSemanticOverlay {
  return {
    id,
    kind,
    text,
    quads: [[{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]],
  };
}

test("a region covering changed text is named after that text", () => {
  const regions = describeRegions(
    [{ id: "1", x: 20, y: 30, width: 6, height: 2 }],
    [overlay("t1", "changed", "TOLERANCE ±0.05", 19, 29.5, 10, 3)],
  );
  assert.equal(regions[0]!.label, "Changed “TOLERANCE ±0.05”");
  assert.equal(regions[0]!.kind, "changed");
});

test("region kind follows the matched overlay rather than a hardcoded value", () => {
  const regions = describeRegions(
    [{ id: "1", x: 10, y: 10, width: 5, height: 2 }, { id: "2", x: 60, y: 60, width: 5, height: 2 }],
    [overlay("a", "added", "Rev C", 10, 10, 5, 2), overlay("b", "removed", "Rev B", 60, 60, 5, 2)],
  );
  assert.deepEqual(regions.map((region) => region.kind), ["added", "removed"]);
  assert.deepEqual(regions.map((region) => region.label), ['Added “Rev C”', 'Removed “Rev B”']);
});

test("the overlay with the largest overlap wins", () => {
  const regions = describeRegions(
    [{ id: "1", x: 10, y: 10, width: 10, height: 4 }],
    [overlay("small", "added", "sliver", 9, 10, 2, 4), overlay("big", "removed", "body text", 12, 10, 8, 4)],
  );
  assert.equal(regions[0]!.label, "Removed “body text”");
});

test("regions with no text underneath are numbered graphic changes", () => {
  const regions = describeRegions(
    [{ id: "1", x: 5, y: 5, width: 2, height: 2 }, { id: "2", x: 80, y: 80, width: 2, height: 2 }],
    [overlay("t1", "changed", "elsewhere", 40, 40, 5, 2)],
  );
  assert.deepEqual(regions.map((region) => region.label), ["Graphic change 1", "Graphic change 2"]);
  assert.deepEqual(regions.map((region) => region.kind), ["changed", "changed"]);
});

test("graphic numbering counts only unlabeled regions", () => {
  const regions = describeRegions(
    [{ id: "1", x: 5, y: 5, width: 2, height: 2 }, { id: "2", x: 40, y: 40, width: 2, height: 2 }, { id: "3", x: 80, y: 80, width: 2, height: 2 }],
    [overlay("t1", "changed", "middle", 40, 40, 2, 2)],
  );
  assert.deepEqual(regions.map((region) => region.label), ["Graphic change 1", "Changed “middle”", "Graphic change 2"]);
});

test("a region just outside a glyph quad still matches within tolerance", () => {
  const regions = describeRegions(
    [{ id: "1", x: 30.2, y: 20.2, width: 0.3, height: 0.3 }],
    [overlay("t1", "added", "i", 30, 20, 0.1, 0.1)],
  );
  assert.equal(regions[0]!.label, 'Added “i”');
});

test("labels collapse whitespace and clip long runs", () => {
  assert.equal(regionLabel("changed", "  spaced \n out  "), "Changed “spaced out”");
  assert.equal(regionLabel("added", ""), null);
  const long = regionLabel("removed", "x".repeat(120))!;
  assert.equal(long.length, "Removed “”".length + 60);
  assert.ok(long.endsWith("…”"));
});

test("an overlay without quads never matches", () => {
  const regions = describeRegions(
    [{ id: "1", x: 10, y: 10, width: 5, height: 5 }],
    [{ id: "empty", kind: "added", text: "no geometry", quads: [] }],
  );
  assert.equal(regions[0]!.label, "Graphic change 1");
});

test("one text change wrapped over several lines becomes a single entry", () => {
  const wrapped = overlay("c1", "changed", "a long sentence that wraps", 10, 20, 60, 12);
  const regions = describeRegions(
    [
      { id: "1", x: 12, y: 21, width: 50, height: 3 },
      { id: "2", x: 10, y: 25, width: 55, height: 3 },
      { id: "3", x: 10, y: 29, width: 30, height: 3 },
    ],
    [wrapped],
  );
  assert.equal(regions.length, 1);
  assert.equal(regions[0]!.label, "Changed “a long sentence that wraps”");
  assert.deepEqual(
    { x: regions[0]!.x, y: regions[0]!.y, width: regions[0]!.width, height: regions[0]!.height },
    { x: 10, y: 21, width: 55, height: 11 },
  );
});

test("the before and after overlays of one change group together", () => {
  const before = overlay("c1", "changed", "Rev B", 10, 10, 8, 3);
  const after = { ...overlay("c1", "changed", "Rev C", 10, 14, 8, 3), id: "c1" };
  const regions = describeRegions(
    [{ id: "1", x: 10, y: 10, width: 8, height: 3 }, { id: "2", x: 10, y: 14, width: 8, height: 3 }],
    [before, after],
  );
  assert.equal(regions.length, 1);
  assert.equal(regions[0]!.height, 7);
});

test("graphic regions stay separate entries and keep sequential numbers", () => {
  const regions = describeRegions(
    [
      { id: "1", x: 5, y: 5, width: 2, height: 2 },
      { id: "2", x: 20, y: 20, width: 4, height: 3 },
      { id: "3", x: 20, y: 24, width: 4, height: 3 },
      { id: "4", x: 80, y: 80, width: 2, height: 2 },
    ],
    [overlay("c1", "added", "grouped", 20, 20, 4, 7)],
  );
  assert.deepEqual(regions.map((region) => region.label), ["Graphic change 1", 'Added “grouped”', "Graphic change 2"]);
});
