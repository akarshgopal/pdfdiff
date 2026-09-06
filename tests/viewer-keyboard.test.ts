import assert from "node:assert/strict";
import { test } from "node:test";
import { sourceSideForEvent } from "../packages/viewer-react/dist/useViewerKeyboard.js";

const event = (key: string, modifier?: "shiftKey" | "ctrlKey" | "metaKey") =>
  ({
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    ...(modifier ? { [modifier]: true } : {}),
  }) as KeyboardEvent;

test("modifiers pick a document side only for navigation keys", () => {
  assert.equal(sourceSideForEvent(event("ArrowRight", "shiftKey")), "earlier");
  assert.equal(sourceSideForEvent(event("End", "shiftKey")), "earlier");
  assert.equal(sourceSideForEvent(event("PageDown", "ctrlKey")), "newer");
  assert.equal(sourceSideForEvent(event("Home", "metaKey")), "newer");
  assert.equal(sourceSideForEvent(event("ArrowLeft")), null);
  // Cmd/Ctrl plus a letter stays with the browser.
  assert.equal(sourceSideForEvent(event("j", "metaKey")), null);
  assert.equal(sourceSideForEvent(event("s", "ctrlKey")), null);
});
