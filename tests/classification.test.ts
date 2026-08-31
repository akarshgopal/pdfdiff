import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyRegions, type ChangeRegion } from "@pdfdiff/core";

function region(id: number, x: number, y: number, width: number, height: number): ChangeRegion {
  return { id, x, y, width, height, pixelCount: width * height, area: width * height };
}

const NOTHING = { changedText: [], movedText: [], staticText: [] };

test("a region over genuinely edited text is content", () => {
  const result = classifyRegions({
    ...NOTHING,
    regions: [region(1, 100, 100, 50, 12)],
    changedText: [{ x: 98, y: 99, width: 60, height: 14 }],
  });
  assert.equal(result.regions[0]!.changeClass, "content");
  assert.equal(result.counts.content, 1);
});

test("a region over text that only moved is reflow", () => {
  const result = classifyRegions({
    ...NOTHING,
    regions: [region(1, 100, 300, 50, 12)],
    movedText: [{ x: 100, y: 298, width: 50, height: 14 }],
  });
  assert.equal(result.regions[0]!.changeClass, "reflow");
});

test("a region over unchanged text in place is formatting", () => {
  const result = classifyRegions({
    ...NOTHING,
    regions: [region(1, 100, 100, 50, 12)],
    staticText: [{ x: 100, y: 100, width: 50, height: 12 }],
  });
  assert.equal(result.regions[0]!.changeClass, "formatting");
});

test("a region touching no text at all is graphic", () => {
  const result = classifyRegions({ ...NOTHING, regions: [region(1, 10, 10, 40, 40)] });
  assert.equal(result.regions[0]!.changeClass, "graphic");
  assert.equal(result.counts.graphic, 1);
});

test("content wins when a region touches both edited and merely moved text", () => {
  const result = classifyRegions({
    ...NOTHING,
    regions: [region(1, 100, 100, 200, 12)],
    changedText: [{ x: 280, y: 100, width: 30, height: 12 }],
    movedText: [{ x: 100, y: 100, width: 60, height: 12 }],
  });
  assert.equal(result.regions[0]!.changeClass, "content");
});

test("reflow wins over formatting for the same region", () => {
  const result = classifyRegions({
    ...NOTHING,
    regions: [region(1, 100, 100, 80, 12)],
    movedText: [{ x: 150, y: 100, width: 40, height: 12 }],
    staticText: [{ x: 100, y: 100, width: 40, height: 12 }],
  });
  assert.equal(result.regions[0]!.changeClass, "reflow");
});

test("the page is not noticeable when every region is reflow or formatting", () => {
  const result = classifyRegions({
    ...NOTHING,
    regions: [region(1, 100, 100, 50, 12), region(2, 100, 200, 50, 12)],
    movedText: [{ x: 100, y: 100, width: 50, height: 12 }],
    staticText: [{ x: 100, y: 200, width: 50, height: 12 }],
  });
  assert.deepEqual(result.counts, { content: 0, reflow: 1, formatting: 1, graphic: 0 });
  assert.equal(result.noticeable, false);
});

test("one real edit among reflow noise still makes the page noticeable", () => {
  const result = classifyRegions({
    ...NOTHING,
    regions: [region(1, 100, 100, 50, 12), region(2, 100, 200, 50, 12)],
    changedText: [{ x: 100, y: 100, width: 50, height: 12 }],
    movedText: [{ x: 100, y: 200, width: 50, height: 12 }],
  });
  assert.equal(result.noticeable, true);
  assert.deepEqual(result.counts, { content: 1, reflow: 1, formatting: 0, graphic: 0 });
});

test("a graphic-only page counts as noticeable", () => {
  assert.equal(classifyRegions({ ...NOTHING, regions: [region(1, 0, 0, 10, 10)] }).noticeable, true);
});

test("near-misses within tolerance still attach to their text", () => {
  const result = classifyRegions({
    ...NOTHING,
    regions: [region(1, 100, 100, 20, 10)],
    changedText: [{ x: 121, y: 100, width: 20, height: 10 }],
  });
  assert.equal(result.regions[0]!.changeClass, "content");

  const far = classifyRegions({
    ...NOTHING,
    regions: [region(1, 100, 100, 20, 10)],
    changedText: [{ x: 140, y: 100, width: 20, height: 10 }],
  });
  assert.equal(far.regions[0]!.changeClass, "graphic");
});
