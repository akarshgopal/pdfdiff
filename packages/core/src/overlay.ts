import type { OverlayStyle, RgbColor } from "./types.js";

export const DEFAULT_OVERLAY: OverlayStyle = {
  addedColor: [16, 190, 190],
  removedColor: [238, 72, 86],
  modifiedColor: [184, 126, 220],
  unchangedOpacity: 0.4,
};

export function rgbToHex([red, green, blue]: RgbColor): string {
  return `#${[red, green, blue]
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function hexToRgb(value: string, fallback: RgbColor): RgbColor {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return fallback;
  const channels = Number.parseInt(match[1]!, 16);
  return [(channels >> 16) & 255, (channels >> 8) & 255, channels & 255];
}
