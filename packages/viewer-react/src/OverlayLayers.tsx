import type { CSSProperties } from "react";
import { styles, styleProps } from "./styles.js";
import type { DiffPage, OverlayStyle } from "./types.js";

/**
 * The overlay is a greyscale base plus three directional alpha masks.
 * Colour and opacity are CSS custom properties, so changing them is a style
 * write the compositor handles — no re-encode, no pixel loop, no re-diff.
 */

function tintStyle(mask: string, color: string): CSSProperties {
  return {
    backgroundColor: color,
    maskImage: `url(${mask})`,
    WebkitMaskImage: `url(${mask})`,
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
  };
}

export function OverlayLayerStack({ page, overlay, alt }: { page: DiffPage; overlay: OverlayStyle; alt: string }) {
  const layers = page.layers;
  if (!layers) return null;
  return (
    <div {...styleProps(styles.layerStack)} data-overlay-stack="">
      <img
        {...styleProps(styles.layerBase)}
        data-layer="base"
        src={layers.base}
        alt={alt}
        draggable={false}
        style={{ opacity: overlay.unchangedOpacity }}
      />
      <div
        {...styleProps(styles.layerTint)}
        data-layer="removed"
        aria-hidden="true"
        style={tintStyle(layers.removed, overlay.removedColor)}
      />
      <div
        {...styleProps(styles.layerTint)}
        data-layer="modified"
        aria-hidden="true"
        style={tintStyle(layers.modified, overlay.modifiedColor)}
      />
      <div
        {...styleProps(styles.layerTint)}
        data-layer="added"
        aria-hidden="true"
        style={tintStyle(layers.added, overlay.addedColor)}
      />
    </div>
  );
}
