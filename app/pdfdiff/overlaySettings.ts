import { DEFAULT_OVERLAY, hexToRgb, rgbToHex, type OverlayStyle, type RgbColor } from "@pdfdiff/core";

export { DEFAULT_OVERLAY };
export const toHex = rgbToHex;
export const fromHex = hexToRgb;

/**
 * Overlay colours are baked into each page raster while it is compared, so they
 * are chosen before a run rather than tweaked in the viewer. Keeping the choice
 * on the device means a reviewer sets their palette once — which matters most
 * for anyone the default palette does not work for.
 *
 * Unchanged content stays at 40% so drawings and datasheets remain readable;
 * a fainter page lets line-edge speckle dominate the overlay without helping.
 */

const STORAGE_KEY = "pdfdiff-overlay";

function isRgb(value: unknown): value is RgbColor {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((channel) => typeof channel === "number" && Number.isFinite(channel))
  );
}

/** Anything unreadable falls back to the defaults; a bad stored value must never block a comparison. */
export function readOverlaySettings(): OverlayStyle {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!stored || typeof stored !== "object") return DEFAULT_OVERLAY;
    const { addedColor, removedColor, modifiedColor, unchangedOpacity } = stored as Partial<OverlayStyle>;
    return {
      addedColor: isRgb(addedColor) ? addedColor : DEFAULT_OVERLAY.addedColor,
      removedColor: isRgb(removedColor) ? removedColor : DEFAULT_OVERLAY.removedColor,
      modifiedColor: isRgb(modifiedColor) ? modifiedColor : DEFAULT_OVERLAY.modifiedColor,
      unchangedOpacity:
        typeof unchangedOpacity === "number" && unchangedOpacity >= 0 && unchangedOpacity <= 1
          ? unchangedOpacity
          : DEFAULT_OVERLAY.unchangedOpacity,
    };
  } catch {
    return DEFAULT_OVERLAY;
  }
}

export function writeOverlaySettings(overlay: OverlayStyle): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overlay));
  } catch {
    // Private browsing and storage policies can disable localStorage. Comparing still works.
  }
}
