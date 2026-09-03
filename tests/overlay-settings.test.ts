import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_OVERLAY, fromHex, readOverlaySettings, toHex, writeOverlaySettings } from "../app/pdfdiff/overlaySettings.ts";

function withStorage(initial: string | null, run: () => void): void {
  let value = initial;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
  try {
    run();
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

test("hex survives a round trip through the colour input", () => {
  assert.equal(toHex([16, 190, 190]), "#10bebe");
  assert.equal(toHex([0, 0, 0]), "#000000");
  assert.equal(toHex([255, 255, 255]), "#ffffff");
  assert.deepEqual(fromHex("#10bebe", [0, 0, 0]), [16, 190, 190]);
  assert.deepEqual(fromHex("10BEBE", [0, 0, 0]), [16, 190, 190], "a missing hash still parses");
});

test("a malformed colour keeps the previous one rather than painting garbage", () => {
  assert.deepEqual(fromHex("", [1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(fromHex("#fff", [1, 2, 3]), [1, 2, 3], "short hex is not accepted");
  assert.deepEqual(fromHex("rgb(1,2,3)", [1, 2, 3]), [1, 2, 3]);
});

test("settings persist across sessions", () => {
  withStorage(null, () => {
    assert.deepEqual(readOverlaySettings(), DEFAULT_OVERLAY, "an empty device gets the defaults");
    writeOverlaySettings({ addedColor: [1, 2, 3], removedColor: [4, 5, 6], modifiedColor: [7, 8, 9], unchangedOpacity: 0.5 });
    assert.deepEqual(readOverlaySettings(), { addedColor: [1, 2, 3], removedColor: [4, 5, 6], modifiedColor: [7, 8, 9], unchangedOpacity: 0.5 });
  });
});

test("a corrupt or out-of-range stored value can never block a comparison", () => {
  withStorage("not json", () => assert.deepEqual(readOverlaySettings(), DEFAULT_OVERLAY));
  withStorage('{"addedColor":"teal"}', () => assert.deepEqual(readOverlaySettings(), DEFAULT_OVERLAY));
  withStorage('{"unchangedOpacity":9}', () => {
    assert.equal(readOverlaySettings().unchangedOpacity, DEFAULT_OVERLAY.unchangedOpacity, "opacity outside 0..1 is rejected");
  });
  withStorage('{"addedColor":[1,2,3]}', () => {
    const overlay = readOverlaySettings();
    assert.deepEqual(overlay.addedColor, [1, 2, 3], "a partial record keeps what it can");
    assert.deepEqual(overlay.removedColor, DEFAULT_OVERLAY.removedColor);
    assert.deepEqual(overlay.modifiedColor, DEFAULT_OVERLAY.modifiedColor);
  });
});

test("storage that throws is survivable", () => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
  };
  try {
    assert.deepEqual(readOverlaySettings(), DEFAULT_OVERLAY);
    writeOverlaySettings(DEFAULT_OVERLAY);
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
