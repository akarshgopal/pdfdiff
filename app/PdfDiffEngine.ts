"use client";

import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createPdfJsEngine } from "@pdfdiff/pdfjs-browser";
import type { ComparisonPage, ComparisonResult, RasterImage, VisualPageGeometry } from "@pdfdiff/core";
import type { DiffComparison, DiffPage, DiffSemanticOverlay, DiffRegion, DiffTextChange } from "@pdfdiff/viewer-react";
import type { PdfDiffEngine } from "./pdfdiff/PdfDiffApp";

const MAX_VIEWER_TEXT_CHANGES = 80;
const MAX_VIEWER_SEMANTIC_OVERLAYS = 160;

function imageDataFromRaster(image: RasterImage): ImageData {
  return new ImageData(image.data as ImageDataArray, image.width, image.height);
}

async function imageUrl(image: RasterImage, format: "webp" | "png" = "webp"): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Your browser does not provide a 2D canvas context.");
  context.putImageData(imageDataFromRaster(image), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to encode a comparison preview.")), format === "png" ? "image/png" : "image/webp", 0.9);
  });
  const url = URL.createObjectURL(blob);
  canvas.width = 0;
  canvas.height = 0;
  return url;
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
  return (page.semantic?.changes ?? []).slice(0, MAX_VIEWER_TEXT_CHANGES).map((change) => ({
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
  return overlays.slice(0, MAX_VIEWER_SEMANTIC_OVERLAYS).map((overlay) => ({
    id: overlay.id,
    kind: overlay.kind,
    text: overlay.text,
    quads: overlay.quads.map((quad) => normalizedQuad(quad, geometry, page.width ?? 1, page.height ?? 1)),
  }));
}

async function toViewerPage(page: ComparisonPage): Promise<DiffPage> {
  const [beforeSrc, afterSrc, diffSrc] = await Promise.all([
    page.earlier ? imageUrl(page.earlier) : undefined,
    page.newer ? imageUrl(page.newer) : undefined,
    page.diff ? imageUrl(page.diff, "png") : undefined,
  ]);
  return {
    index: page.index,
    width: page.width,
    height: page.height,
    status: page.status,
    beforeSrc,
    afterSrc,
    diffSrc,
    changedPixels: page.changedPixels,
    changedPercent: page.changedPercent,
    regions: regionsForPage(page),
    textChanges: textChangesForPage(page),
    textChangeCount: page.semantic?.changes.length ?? 0,
    semantic: page.semantic,
    semanticBeforeOverlays: semanticOverlaysForPage(page, "earlier"),
    semanticAfterOverlays: semanticOverlaysForPage(page, "newer"),
    error: page.error,
  };
}

type RawPagePairResolver = (request: { earlierPageIndex: number; newerPageIndex: number; signal: AbortSignal }) => Promise<ComparisonPage>;

async function toViewerComparison(result: ComparisonResult, resolveRawPagePair?: RawPagePairResolver): Promise<DiffComparison> {
  const pages = await Promise.all(result.pages.map(toViewerPage));
  const urls = new Set<string>();
  const pairCache = new Map<string, DiffPage>();
  let disposed = false;
  const trackPageUrls = (page: DiffPage): void => {
    for (const url of [page.beforeSrc, page.afterSrc, page.diffSrc]) {
      if (!url) continue;
      if (disposed) URL.revokeObjectURL(url);
      else urls.add(url);
    }
  };
  pages.forEach(trackPageUrls);
  return {
    earlierName: result.earlierName ?? "Earlier PDF",
    newerName: result.newerName ?? "Newer PDF",
    pages,
    elapsedMs: result.elapsedMs,
    comparePagePair: resolveRawPagePair ? async (request) => {
      if (request.signal.aborted) throw new DOMException("The page comparison was aborted.", "AbortError");
      const key = `${request.earlierPageIndex}:${request.newerPageIndex}`;
      const cached = pairCache.get(key);
      if (cached) return cached;
      const page = await toViewerPage(await resolveRawPagePair(request));
      if (request.signal.aborted) {
        for (const url of [page.beforeSrc, page.afterSrc, page.diffSrc]) if (url) URL.revokeObjectURL(url);
        throw new DOMException("The page comparison was aborted.", "AbortError");
      }
      trackPageUrls(page);
      pairCache.set(key, page);
      return page;
    } : undefined,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      pairCache.clear();
    },
  };
}

const engine = createPdfJsEngine({ workerSrc: workerUrl });

export const browserPdfDiffEngine: PdfDiffEngine = {
  async compare(request) {
    const result = await engine.compare(request);
    return toViewerComparison(result, ({ earlierPageIndex, newerPageIndex, signal }) => engine.comparePagePair({
      earlier: request.earlier,
      newer: request.newer,
      earlierPageIndex,
      newerPageIndex,
      options: request.options,
      signal,
      onMetric: request.onMetric,
    }));
  },
};
