import type { OverlayStyle, RgbColor } from "@pdfdiff/core";

/**
 * Overlay colours are baked into each page raster while it is compared, so they
 * are chosen before a run rather than tweaked in the viewer. Keeping the choice
 * on the device means a reviewer sets their palette once — which matters most
 * for anyone the default palette does not work for.
 */

const STORAGE_KEY = "pdfdiff-overlay";

export const DEFAULT_OVERLAY: OverlayStyle = {
  addedColor: [16, 190, 190],
  removedColor: [238, 72, 86],
  modifiedColor: [184, 126, 220],
  unchangedOpacity: 0.24,
};

export function toHex([red, green, blue]: RgbColor): string {
  return `#${[red, green, blue].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
}

export function fromHex(value: string, fallback: RgbColor): RgbColor {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return fallback;
  const channels = Number.parseInt(match[1]!, 16);
  return [(channels >> 16) & 255, (channels >> 8) & 255, channels & 255];
}

function isRgb(value: unknown): value is RgbColor {
  return Array.isArray(value) && value.length === 3 && value.every((channel) => typeof channel === "number" && Number.isFinite(channel));
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
      unchangedOpacity: typeof unchangedOpacity === "number" && unchangedOpacity >= 0 && unchangedOpacity <= 1
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
