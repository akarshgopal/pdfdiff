import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SENSITIVITY,
  boundedRenderSize,
  comparisonThreshold,
  diffImages,
  diffSemanticText,
  type DiffMetric,
} from "@pdfdiff/core";

function raster(fill: number): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(16);
  data.fill(fill);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
  return { width: 2, height: 2, data };
}

test("the default sensitivity maps to the same pixel threshold in every adapter", () => {
  assert.equal(comparisonThreshold(DEFAULT_SENSITIVITY), 0.18 - 28 * 0.00145);
});

test("boundedRenderSize keeps scale, pixels, and longest edge in budget", () => {
  const letter = boundedRenderSize(612, 792, 2, 3_000_000, 2800);
  assert.equal(letter.scale, 2);
  assert.equal(letter.width, 1224);
  assert.equal(letter.height, 1584);
  const drawing = boundedRenderSize(2000, 2000, 2, 3_000_000, 2800);
  assert.ok(drawing.scale < 2);
  assert.ok(Math.max(drawing.width, drawing.height) <= 2800);
});

test("core raster comparison works without browser globals", () => {
  const earlier = raster(255);
  const newer = raster(255);
  newer.data[0] = 0;
  newer.data[1] = 0;
  newer.data[2] = 0;

  const result = diffImages(earlier, newer, { threshold: 0, regionOptions: { minPixels: 1 } });

  assert.equal(result.width, 2);
  assert.equal(result.height, 2);
  assert.equal(result.changedPixels, 1);
  assert.equal(result.addedPixels, 1);
  assert.equal(result.removedPixels, 0);
  assert.equal(result.modifiedPixels, 0);
  assert.equal(result.regions.length, 1);
});

test("color changes are modified rather than guessed from luminance", () => {
  const earlier = raster(255);
  const newer = raster(255);
  earlier.data.set([0, 0, 255, 255], 0);
  newer.data.set([255, 0, 0, 255], 0);

  const result = diffImages(earlier, newer, { threshold: 0, regionOptions: { minPixels: 1 } });

  assert.equal(result.addedPixels, 0);
  assert.equal(result.removedPixels, 0);
  assert.equal(result.modifiedPixels, 1);
});

test("core semantic comparison is importable as a package API", () => {
  const result = diffSemanticText("Keep this line.", "Keep this revised line.");
  assert.equal(result.changes[0]?.kind, "added");
  assert.equal(result.changes[0]?.after, "revised");
});

test("core comparison emits opt-in phase metrics", () => {
  const metrics: DiffMetric[] = [];
  const earlier = raster(255);
  const newer = raster(255);
  newer.data[0] = 0;

  diffImages(earlier, newer, {
    threshold: 0,
    regionOptions: { minPixels: 1 },
    metrics: (metric) => metrics.push(metric),
  });

  assert.ok(metrics.some((metric) => metric.name === "core.visual.pixelmatch"));
  assert.ok(metrics.some((metric) => metric.name === "core.visual.overlay"));
  assert.ok(metrics.some((metric) => metric.name === "core.visual.regions"));
  assert.ok(metrics.every((metric) => metric.status === "ok" && metric.durationMs >= 0));
});
