import assert from "node:assert/strict";
import { test } from "node:test";
import { diffImages, diffSemanticText, type DiffMetric } from "@pdfdiff/core";

function raster(fill: number): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(16);
  data.fill(fill);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
  return { width: 2, height: 2, data };
}

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
  assert.equal(result.regions.length, 1);
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
