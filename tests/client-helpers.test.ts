import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bucketDuration,
  bucketFileSize,
  bucketPageCount,
  clampPageNumber,
  formatBytes,
  formatPageCount,
  formatPagePosition,
  formatPercent,
  getFileExtension,
} from "../lib/client/document-metadata.ts";
import { createPrivacyAnalytics, sanitizeAnalyticsEvent } from "../lib/client/analytics.ts";
import { isWebGpuSupported, probeWebGpu } from "../lib/client/webgpu.ts";

test("formats byte counts and invalid values deterministically", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1.5 * 1024 * 1024), "1.5 MB");
  assert.equal(formatBytes(-1), "—");
  assert.equal(formatBytes(Number.NaN), "—");
});

test("formats and clamps page positions", () => {
  assert.equal(formatPageCount(1), "1 page");
  assert.equal(formatPageCount(3), "3 pages");
  assert.equal(formatPagePosition(99, 4), "Page 4 of 4");
  assert.equal(formatPagePosition(0, 4), "Page 1 of 4");
  assert.equal(formatPagePosition(1, 0), "—");
  assert.equal(clampPageNumber(3.9, 3), 3);
});

test("formats percentages, extensions, and privacy buckets", () => {
  assert.equal(formatPercent(12.345), "12.3%");
  assert.equal(formatPercent(Number.POSITIVE_INFINITY), "—");
  assert.equal(getFileExtension("/tmp/Plan.Rev2.PDF"), "pdf");
  assert.equal(getFileExtension("no-extension"), "");
  assert.equal(bucketFileSize(1024 * 1024), "1-10mb");
  assert.equal(bucketFileSize(100 * 1024 * 1024), "100mb+");
  assert.equal(bucketPageCount(0), "0");
  assert.equal(bucketPageCount(21), "21-50");
  assert.equal(bucketDuration(999), "under-1s");
  assert.equal(bucketDuration(60_000), "60s+");
});

test("sanitizes analytics to the fixed event schema", () => {
  assert.deepEqual(sanitizeAnalyticsEvent({ name: "app_loaded", secret: "drop" }), { name: "app_loaded" });
  assert.deepEqual(
    sanitizeAnalyticsEvent({ name: "comparison_started", pageBucket: "1-5", sizeBucket: "0-1mb" }),
    { name: "comparison_started", pageBucket: "1-5", sizeBucket: "0-1mb" },
  );
  assert.equal(sanitizeAnalyticsEvent({ name: "comparison_started", pageBucket: 10, sizeBucket: "0-1mb" }), null);
  assert.equal(sanitizeAnalyticsEvent({ name: "not-an-event" }), null);
});

test("analytics is disabled and network-free by default", async () => {
  let sent = false;
  const analytics = createPrivacyAnalytics({ transport: async () => { sent = true; } });
  assert.equal(analytics.enabled, false);
  assert.equal(analytics.track({ name: "app_loaded" }), false);
  await analytics.flush();
  assert.equal(sent, false);
});

test("enabled analytics sends only an allowlisted batch", async () => {
  const bodies: string[] = [];
  const analytics = createPrivacyAnalytics({
    endpoint: "/telemetry",
    enabled: true,
    autoFlush: false,
    transport: async (_endpoint, body) => {
      bodies.push(body);
    },
  });
  assert.equal(analytics.track({ name: "view_mode_used", mode: "overlay" }), true);
  assert.equal(analytics.queueSize, 1);
  await analytics.flush();
  assert.equal(analytics.queueSize, 0);
  assert.deepEqual(JSON.parse(bodies[0]!), { v: 1, events: [{ name: "view_mode_used", mode: "overlay" }] });
});

test("WebGPU probe reports graceful fallback states", async () => {
  const unavailable = await probeWebGpu({ gpu: undefined });
  assert.equal(unavailable.supported, false);
  assert.equal(unavailable.reason, "unavailable");

  const supported = await probeWebGpu({ gpu: { requestAdapter: async () => ({}) } });
  assert.equal(isWebGpuSupported(supported), true);

  let destroyed = false;
  const deviceChecked = await probeWebGpu({
    requestDevice: true,
    gpu: {
      requestAdapter: async () => ({
        requestDevice: async () => ({ destroy: () => { destroyed = true; } }),
      }),
    },
  });
  assert.equal(deviceChecked.usable, true);
  assert.equal(destroyed, true);
});
