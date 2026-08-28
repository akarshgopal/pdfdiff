"use client";

import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createPdfJsEngine } from "@pdfdiff/pdfjs-browser";
import type { ComparisonPage, ComparisonResult, RasterImage, VisualPageGeometry } from "@pdfdiff/core";
import type { DiffComparison, DiffPage, DiffSemanticOverlay, DiffRegion, DiffTextChange } from "@pdfdiff/viewer-react";
import type { PdfDiffEngine } from "./pdfdiff/PdfDiffApp";

function imageDataFromRaster(image: RasterImage): ImageData {
  return new ImageData(image.data as ImageDataArray, image.width, image.height);
}

function imageUrl(image: RasterImage, format: "webp" | "png" = "webp"): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Your browser does not provide a 2D canvas context.");
  context.putImageData(imageDataFromRaster(image), 0, 0);
  return format === "png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/webp", 0.9);
}

function regionsForPage(page: ComparisonPage): DiffRegion[] {
  const width = page.width ?? 1;
  const height = page.height ?? 1;
  return (page.regions ?? []).map((region) => ({
    id: String(region.id),
    x: (region.x / width) * 100,
    y: (region.y / height) * 100,
    width: (region.width / width) * 100,
    height: (region.height / height) * 100,
    kind: "changed",
    label: `Change ${region.id}`,
  }));
}

function textChangesForPage(page: ComparisonPage): DiffTextChange[] {
  return (page.semantic?.changes ?? []).slice(0, 80).map((change) => ({
    id: change.id,
    text: change.kind === "changed" ? `${change.before} → ${change.after}` : change.kind === "removed" ? change.before : change.after,
    kind: change.kind,
    beforeText: change.before || undefined,
    afterText: change.after || undefined,
  }));
}

function normalizedQuad(
  quad: ReadonlyArray<{ x: number; y: number }>,
  geometry: VisualPageGeometry | undefined,
  width: number,
  height: number,
): ReadonlyArray<{ x: number; y: number }> {
  if (!geometry) return [];
  return quad.map((point) => ({
    x: ((point.x * geometry.scale + geometry.offsetX) / width) * 100,
    y: ((point.y * geometry.scale + geometry.offsetY) / height) * 100,
  }));
}

function semanticOverlaysForPage(page: ComparisonPage, side: "earlier" | "newer"): DiffSemanticOverlay[] {
  const overlays = side === "earlier" ? page.semantic?.beforeOverlays ?? [] : page.semantic?.afterOverlays ?? [];
  const geometry = page.visualGeometry?.[side];
  return overlays.slice(0, 160).map((overlay) => ({
    id: overlay.id,
    kind: overlay.kind,
    text: overlay.text,
    quads: overlay.quads.map((quad) => normalizedQuad(quad, geometry, page.width ?? 1, page.height ?? 1)),
  }));
}

function toViewerPage(page: ComparisonPage): DiffPage {
  return {
    index: page.index,
    width: page.width,
    height: page.height,
    status: page.status,
    beforeSrc: page.earlier ? imageUrl(page.earlier) : undefined,
    afterSrc: page.newer ? imageUrl(page.newer) : undefined,
    diffSrc: page.diff ? imageUrl(page.diff, "png") : undefined,
    changedPixels: page.changedPixels,
    changedPercent: page.changedPercent,
    regions: regionsForPage(page),
    textChanges: textChangesForPage(page),
    semantic: page.semantic,
    semanticBeforeOverlays: semanticOverlaysForPage(page, "earlier"),
    semanticAfterOverlays: semanticOverlaysForPage(page, "newer"),
    error: page.error,
  };
}

function toViewerComparison(result: ComparisonResult): DiffComparison {
  return {
    earlierName: result.earlierName ?? "Earlier PDF",
    newerName: result.newerName ?? "Newer PDF",
    pages: result.pages.map(toViewerPage),
    elapsedMs: result.elapsedMs,
  };
}

const engine = createPdfJsEngine({ workerSrc: workerUrl });

export const browserPdfDiffEngine: PdfDiffEngine = {
  async compare(request) {
    return toViewerComparison(await engine.compare(request));
  },
};
