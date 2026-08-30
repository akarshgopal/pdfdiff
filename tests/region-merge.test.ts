import assert from "node:assert/strict";
import { test } from "node:test";
import { findChangeRegions } from "@pdfdiff/core";

/** Page-sized so the reading-order band (1% of height) matches a real text line. */
const WIDTH = 400;
const HEIGHT = 800;
const MERGE = { mergeGapX: 24, mergeGapY: 8 };

function maskWith(boxes: ReadonlyArray<{ x: number; y: number; width: number; height: number }>): Uint8Array {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  for (const box of boxes) {
    for (let y = box.y; y < box.y + box.height; y += 1) {
      for (let x = box.x; x < box.x + box.width; x += 1) mask[y * WIDTH + x] = 1;
    }
  }
  return mask;
}

/** Three glyph-sized blobs on one line, separated by word-sized gaps. */
const oneTextLine = [
  { x: 40, y: 40, width: 12, height: 24 },
  { x: 72, y: 40, width: 12, height: 24 },
  { x: 104, y: 40, width: 12, height: 24 },
];

test("without merge gaps the scan still returns raw components", () => {
  const regions = findChangeRegions(maskWith(oneTextLine), WIDTH, HEIGHT, { minPixels: 1 });
  assert.equal(regions.length, 3);
});

test("a horizontal gap joins glyphs on the same line into one region", () => {
  const regions = findChangeRegions(maskWith(oneTextLine), WIDTH, HEIGHT, { minPixels: 1, ...MERGE });
  assert.equal(regions.length, 1);
  assert.deepEqual(
    { x: regions[0]!.x, y: regions[0]!.y, width: regions[0]!.width, height: regions[0]!.height },
    { x: 40, y: 40, width: 76, height: 24 },
  );
});

test("merging sums pixel counts and recomputes area from the union box", () => {
  const regions = findChangeRegions(maskWith(oneTextLine), WIDTH, HEIGHT, { minPixels: 1, ...MERGE });
  assert.equal(regions[0]!.pixelCount, 3 * 12 * 24);
  assert.equal(regions[0]!.area, 76 * 24);
});

test("a vertical gap smaller than the line spacing keeps separate lines apart", () => {
  const twoLines = [...oneTextLine, ...oneTextLine.map((box) => ({ ...box, y: 104 }))];
  const regions = findChangeRegions(maskWith(twoLines), WIDTH, HEIGHT, { minPixels: 1, ...MERGE });
  assert.equal(regions.length, 2);
  assert.deepEqual(regions.map((region) => region.y).sort((a, b) => a - b), [40, 104]);
});

test("merging is transitive across a chain of neighbours", () => {
  const chain = Array.from({ length: 8 }, (_, index) => ({ x: 20 + index * 32, y: 160, width: 12, height: 20 }));
  const regions = findChangeRegions(maskWith(chain), WIDTH, HEIGHT, { minPixels: 1, ...MERGE });
  assert.equal(regions.length, 1);
  assert.equal(regions[0]!.width, 7 * 32 + 12);
});

test("reading order sorts top-to-bottom then left-to-right, not by size", () => {
  const boxes = [
    { x: 240, y: 280, width: 16, height: 16 },
    { x: 40, y: 40, width: 80, height: 80 },
    { x: 280, y: 40, width: 16, height: 16 },
    { x: 40, y: 280, width: 16, height: 16 },
  ];
  const bySize = findChangeRegions(maskWith(boxes), WIDTH, HEIGHT, { minPixels: 1 });
  assert.deepEqual(bySize.map((region) => region.pixelCount), [6400, 256, 256, 256]);

  const reading = findChangeRegions(maskWith(boxes), WIDTH, HEIGHT, { minPixels: 1, readingOrder: true });
  assert.deepEqual(reading.map((region) => [region.x, region.y]), [[40, 40], [280, 40], [40, 280], [240, 280]]);
});

test("a tall region reads with the line it starts on, not where its middle lands", () => {
  const boxes = [
    { x: 200, y: 40, width: 16, height: 16 },
    { x: 40, y: 40, width: 16, height: 240 },
  ];
  const regions = findChangeRegions(maskWith(boxes), WIDTH, HEIGHT, { minPixels: 1, readingOrder: true });
  assert.deepEqual(regions.map((region) => region.x), [40, 200]);
});

test("reading order tolerates baseline wobble within a line band", () => {
  const wobbly = [
    { x: 160, y: 203, width: 16, height: 16 },
    { x: 40, y: 200, width: 16, height: 16 },
    { x: 100, y: 200, width: 16, height: 16 },
  ];
  const regions = findChangeRegions(maskWith(wobbly), WIDTH, HEIGHT, { minPixels: 1, readingOrder: true });
  assert.deepEqual(regions.map((region) => region.x), [40, 100, 160]);
});

test("the size limit keeps the largest regions but presents them in reading order", () => {
  const boxes = [
    { x: 280, y: 40, width: 8, height: 8 },
    { x: 40, y: 280, width: 48, height: 48 },
    { x: 40, y: 40, width: 32, height: 32 },
  ];
  const regions = findChangeRegions(maskWith(boxes), WIDTH, HEIGHT, { minPixels: 1, maxRegions: 2, readingOrder: true });
  assert.equal(regions.length, 2);
  assert.deepEqual(regions.map((region) => [region.x, region.y]), [[40, 40], [40, 280]]);
});

test("merging happens before the size limit is applied", () => {
  const line = Array.from({ length: 6 }, (_, index) => ({ x: 20 + index * 32, y: 80, width: 12, height: 20 }));
  const blob = [{ x: 20, y: 240, width: 56, height: 56 }];
  const regions = findChangeRegions(maskWith([...line, ...blob]), WIDTH, HEIGHT, {
    minPixels: 1,
    maxRegions: 2,
    readingOrder: true,
    ...MERGE,
  });
  assert.equal(regions.length, 2);
  assert.equal(regions[0]!.width, 5 * 32 + 12);
  assert.equal(regions[0]!.pixelCount, 6 * 12 * 20);
});
