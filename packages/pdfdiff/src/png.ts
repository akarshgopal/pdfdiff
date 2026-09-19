import { createCanvas, ImageData } from "@napi-rs/canvas";
import type { RasterImage } from "@pdfdiff/core";

/** Encode an RGBA overlay as PNG. */
export async function rasterToPng(image: RasterImage): Promise<Buffer> {
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return Buffer.from(await canvas.encode("png"));
}
