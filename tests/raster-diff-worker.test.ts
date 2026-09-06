import assert from "node:assert/strict";
import { test } from "node:test";
import { alignByTranslation, diffImages, overlayLayers, type RasterImage } from "@pdfdiff/core";
import {
  createRasterDiffClient,
  resultTransfers,
  runRasterDiffJob,
  type RasterDiffJob,
} from "@pdfdiff/pdfjs-browser/raster-diff-worker";

const WIDTH = 40;
const HEIGHT = 30;

/** A page with some ink on it: a filled block plus a line, so there is real structure to align and diff. */
function page(shiftX: number, shiftY: number, extraInk: boolean): RasterImage {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  data.fill(255);
  const ink = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const offset = (y * WIDTH + x) * 4;
    data[offset] = 20;
    data[offset + 1] = 20;
    data[offset + 2] = 20;
  };
  for (let y = 4; y < 12; y += 1) for (let x = 5; x < 20; x += 1) ink(x + shiftX, y + shiftY);
  for (let x = 4; x < 34; x += 1) ink(x + shiftX, 18 + shiftY);
  if (extraInk) for (let y = 22; y < 26; y += 1) for (let x = 24; x < 32; x += 1) ink(x, y);
  return { width: WIDTH, height: HEIGHT, data };
}

function job(earlier: RasterImage, newer: RasterImage, over: Partial<RasterDiffJob> = {}): RasterDiffJob {
  return {
    width: WIDTH,
    height: HEIGHT,
    earlier: earlier.data.slice().buffer as ArrayBuffer,
    newer: newer.data.slice().buffer as ArrayBuffer,
    alignByTranslation: true,
    threshold: 0.1,
    includeAA: false,
    unchangedOpacity: 0.24,
    regionOptions: { minPixels: 4, maxRegions: 50, connectivity: 8, readingOrder: true },
    withLayers: false,
    withMetrics: false,
    ...over,
  };
}

test("the worker job reproduces an in-process align and diff exactly", () => {
  const earlier = page(0, 0, false);
  const newer = page(2, 1, true);

  const expectedAlignment = alignByTranslation(earlier, newer);
  const expected = diffImages(earlier, expectedAlignment.image, {
    threshold: 0.1,
    includeAA: false,
    unchangedOpacity: 0.24,
    regionOptions: { minPixels: 4, maxRegions: 50, connectivity: 8, readingOrder: true },
  });

  const actual = runRasterDiffJob(job(earlier, newer));

  assert.equal(actual.dx, expectedAlignment.dx);
  assert.equal(actual.dy, expectedAlignment.dy);
  assert.equal(actual.changedPixels, expected.changedPixels);
  assert.equal(actual.changedPercent, expected.changedPercent);
  assert.deepEqual(actual.regions, expected.regions);
  assert.deepEqual(new Uint8ClampedArray(actual.overlay), expected.overlay.data);
  // The rasters come back so the caller can keep using them after transfer.
  assert.deepEqual(new Uint8ClampedArray(actual.earlier), earlier.data);
  assert.deepEqual(new Uint8ClampedArray(actual.newer), expectedAlignment.image.data);
});

test("layers are built only when asked, and match an in-process build", () => {
  const earlier = page(0, 0, false);
  const newer = page(0, 0, true);
  assert.equal(runRasterDiffJob(job(earlier, newer, { alignByTranslation: false })).layers, undefined);

  const actual = runRasterDiffJob(job(earlier, newer, { alignByTranslation: false, withLayers: true }));
  const expected = overlayLayers(
    earlier,
    newer,
    diffImages(earlier, newer, {
      threshold: 0.1,
      includeAA: false,
      unchangedOpacity: 0.24,
      regionOptions: { minPixels: 4, maxRegions: 50, connectivity: 8, readingOrder: true },
    }).directionMask,
  );

  assert.deepEqual(new Uint8ClampedArray(actual.layers!.base), expected.base.data);
  assert.deepEqual(new Uint8ClampedArray(actual.layers!.added), expected.added.data);
  assert.deepEqual(new Uint8ClampedArray(actual.layers!.removed), expected.removed.data);
  assert.deepEqual(new Uint8ClampedArray(actual.layers!.modified), expected.modified.data);
});

test("skipping alignment leaves the newer page where it was", () => {
  const earlier = page(0, 0, false);
  const newer = page(3, 2, false);
  const actual = runRasterDiffJob(job(earlier, newer, { alignByTranslation: false }));

  assert.equal(actual.dx, 0);
  assert.equal(actual.dy, 0);
  assert.deepEqual(new Uint8ClampedArray(actual.newer), newer.data);
});

test("every returned buffer is transferable exactly once", () => {
  const result = runRasterDiffJob(job(page(0, 0, false), page(1, 0, true), { withLayers: true }));
  const transfers = resultTransfers(result);

  assert.equal(new Set(transfers).size, transfers.length, "a buffer listed twice would throw on postMessage");
  for (const buffer of [result.earlier, result.newer, result.overlay, result.layers!.base]) {
    assert.ok(transfers.includes(buffer));
  }
});

test("metrics are collected only when the host is recording them", () => {
  assert.deepEqual(runRasterDiffJob(job(page(0, 0, false), page(1, 0, true))).metrics, []);
  const names = runRasterDiffJob(job(page(0, 0, false), page(1, 0, true), { withMetrics: true })).metrics.map(
    (metric) => metric.name,
  );
  assert.ok(names.includes("core.alignment.translation"));
  assert.ok(names.includes("core.visual.pixelmatch"));
});

test("without a worker the client compares in-process and still reports metrics", async () => {
  const client = createRasterDiffClient();
  const collected: string[] = [];
  const earlier = page(0, 0, false);
  const newer = page(1, 1, true);

  const viaClient = await client.run(
    job(earlier, newer, { withMetrics: true }),
    new AbortController().signal,
    (metric) => void collected.push(metric.name),
  );
  const direct = runRasterDiffJob(job(earlier, newer));

  assert.equal(viaClient.changedPixels, direct.changedPixels);
  assert.deepEqual(new Uint8ClampedArray(viaClient.overlay), new Uint8ClampedArray(direct.overlay));
  assert.ok(collected.includes("core.visual.regions"));
});

test("an already-aborted comparison never starts the pixel work", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => createRasterDiffClient().run(job(page(0, 0, false), page(1, 0, true)), controller.signal));
});
