"use client";

import type {
  DiffComparison,
  DiffPage,
  DiffRegion,
  DiffTextChange,
  PdfDiffEngine,
} from "./pdfdiff/PdfDiffApp";
import {
  diffImages,
  diffSemanticPages,
  extractPageText,
  loadPdfPair,
  renderPage,
  renderPagePair,
  type RenderedPage,
} from "../lib/pdfdiff";
import type { SemanticPageDiff, SemanticTextOverlay } from "../lib/pdfdiff/semantic";
import type { TextQuad } from "../lib/pdfdiff/types";

const MAX_COMPARISON_PIXELS = 3_000_000;
const PREVIEW_SCALE = 2;

function canvasFromImageData(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Your browser does not provide a 2D canvas context.");
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function previewUrl(canvas: HTMLCanvasElement, format: "webp" | "png" = "webp"): string {
  return format === "png"
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/webp", 0.9);
}

function blankImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  return new ImageData(data, width, height);
}

function shiftImage(source: ImageData, dx: number, dy: number): ImageData {
  if (dx === 0 && dy === 0) return source;
  const target = blankImage(source.width, source.height);
  const { width, height } = source;
  for (let y = Math.max(0, dy); y < Math.min(height, height + dy); y += 1) {
    const sourceY = y - dy;
    const targetStart = (y * width + Math.max(0, dx)) * 4;
    const sourceStart = (sourceY * width + Math.max(0, -dx)) * 4;
    const pixels = width - Math.abs(dx);
    if (pixels > 0) {
      target.data.set(source.data.subarray(sourceStart, sourceStart + pixels * 4), targetStart);
    }
  }
  return target;
}

function translationScore(earlier: ImageData, newer: ImageData, dx: number, dy: number): number {
  const { width, height } = earlier;
  const stride = Math.max(5, Math.ceil(Math.max(width, height) / 420));
  let score = 0;
  let samples = 0;
  for (let y = 18; y < height - 18; y += stride) {
    const newerY = y - dy;
    if (newerY < 0 || newerY >= height) continue;
    for (let x = 18; x < width - 18; x += stride) {
      const newerX = x - dx;
      if (newerX < 0 || newerX >= width) continue;
      const a = (y * width + x) * 4;
      const b = (newerY * width + newerX) * 4;
      const oldLuma = earlier.data[a] * 0.299 + earlier.data[a + 1] * 0.587 + earlier.data[a + 2] * 0.114;
      const newLuma = newer.data[b] * 0.299 + newer.data[b + 1] * 0.587 + newer.data[b + 2] * 0.114;
      score += Math.abs(oldLuma - newLuma);
      samples += 1;
    }
  }
  return samples ? score / samples : Number.POSITIVE_INFINITY;
}

function alignByTranslation(earlier: ImageData, newer: ImageData): { imageData: ImageData; dx: number; dy: number } {
  let bestX = 0;
  let bestY = 0;
  let bestScore = translationScore(earlier, newer, 0, 0);
  const maxShift = Math.max(4, Math.min(18, Math.round(Math.max(earlier.width, earlier.height) / 180)));
  for (let dy = -maxShift; dy <= maxShift; dy += 2) {
    for (let dx = -maxShift; dx <= maxShift; dx += 2) {
      const score = translationScore(earlier, newer, dx, dy);
      if (score < bestScore) {
        bestScore = score;
        bestX = dx;
        bestY = dy;
      }
    }
  }
  for (let dy = bestY - 1; dy <= bestY + 1; dy += 1) {
    for (let dx = bestX - 1; dx <= bestX + 1; dx += 1) {
      const score = translationScore(earlier, newer, dx, dy);
      if (score < bestScore) {
        bestScore = score;
        bestX = dx;
        bestY = dy;
      }
    }
  }
  return { imageData: shiftImage(newer, bestX, bestY), dx: bestX, dy: bestY };
}

function regionsForPage(
  regions: ReadonlyArray<{ id: number; x: number; y: number; width: number; height: number }>,
  width: number,
  height: number,
): DiffRegion[] {
  return regions.slice(0, 80).map((region) => ({
    id: String(region.id),
    x: (region.x / width) * 100,
    y: (region.y / height) * 100,
    width: (region.width / width) * 100,
    height: (region.height / height) * 100,
    kind: "changed",
    label: `Change ${region.id}`,
  }));
}

function textChangesFromSemantic(diff: SemanticPageDiff): DiffTextChange[] {
  return diff.changes.slice(0, 80).map((change) => ({
    id: change.id,
    text: change.kind === "changed"
      ? `${change.before} → ${change.after}`
      : change.kind === "removed" ? change.before : change.after,
    kind: change.kind,
    beforeText: change.before || undefined,
    afterText: change.after || undefined,
  }));
}

function normalizedQuad(
  quad: TextQuad,
  page: RenderedPage,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
): ReadonlyArray<{ x: number; y: number }> {
  return quad.map((point) => ({
    x: ((point.x * page.scale + offsetX) / width) * 100,
    y: ((point.y * page.scale + offsetY) / height) * 100,
  }));
}

function semanticOverlaysForPage(
  overlays: readonly SemanticTextOverlay[],
  page: RenderedPage,
  width: number,
  height: number,
  shiftX = 0,
  shiftY = 0,
) {
  const offsetX = (width - page.width) / 2 + shiftX;
  const offsetY = (height - page.height) / 2 + shiftY;
  return overlays.slice(0, 160).map((overlay) => ({
    id: overlay.id,
    kind: overlay.kind,
    text: overlay.text,
    quads: overlay.quads.map((quad) => normalizedQuad(quad, page, width, height, offsetX, offsetY)),
  }));
}

function asRenderedPage(page: RenderedPage, imageData: ImageData): RenderedPage {
  return { ...page, imageData, canvas: canvasFromImageData(imageData) };
}

export const browserPdfDiffEngine: PdfDiffEngine = {
  async compare({ earlier, newer, options, signal, onProgress }): Promise<DiffComparison> {
    const startedAt = performance.now();
    const pair = await loadPdfPair(earlier, newer, { signal });
    const totalPages = Math.max(pair.earlier.pageCount, pair.newer.pageCount);
    const pages: DiffPage[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        if (signal.aborted) throw new DOMException("Comparison cancelled.", "AbortError");
        const hasEarlier = pageNumber <= pair.earlier.pageCount;
        const hasNewer = pageNumber <= pair.newer.pageCount;

        if (hasEarlier && hasNewer) {
          const rendered = await renderPagePair(pair.earlier, pair.newer, pageNumber, pageNumber, {
            scale: PREVIEW_SCALE,
            maxPixels: MAX_COMPARISON_PIXELS,
            maxDimension: 2800,
            includeAnnotations: true,
            signal,
          });
          const translation = options.alignment === "translation"
            ? alignByTranslation(rendered.earlier.imageData, rendered.newer.imageData)
            : { imageData: rendered.newer.imageData, dx: 0, dy: 0 };
          const alignedNewer = asRenderedPage(rendered.newer, translation.imageData);
          const result = diffImages(rendered.earlier.imageData, alignedNewer.imageData, {
            threshold: Math.max(0.025, 0.18 - options.sensitivity * 0.00145),
            includeAA: false,
            unchangedOpacity: 0.24,
            regionOptions: { minPixels: 8, maxRegions: 80, connectivity: 8 },
            signal,
          });
          const [oldText, newText] = await Promise.all([
            extractPageText(pair.earlier, pageNumber, { signal }),
            extractPageText(pair.newer, pageNumber, { signal }),
          ]);
          const semantic = diffSemanticPages(oldText, newText, { signal });
          pages.push({
            index: pageNumber - 1,
            width: result.width,
            height: result.height,
            status: result.changedPixels === 0 && semantic.changes.length === 0 ? "same" : "changed",
            beforeSrc: previewUrl(rendered.earlier.canvas),
            afterSrc: previewUrl(alignedNewer.canvas),
            diffSrc: previewUrl(canvasFromImageData(result.overlay), "png"),
            changedPixels: result.changedPixels,
            changedPercent: result.changedPercent,
            regions: regionsForPage(result.regions, result.width, result.height),
            textChanges: textChangesFromSemantic(semantic),
            semantic,
            semanticBeforeOverlays: semanticOverlaysForPage(
              semantic.beforeOverlays,
              rendered.earlier,
              result.width,
              result.height,
            ),
            semanticAfterOverlays: semanticOverlaysForPage(
              semantic.afterOverlays,
              rendered.newer,
              result.width,
              result.height,
              translation.dx,
              translation.dy,
            ),
          });
        } else {
          const document = hasEarlier ? pair.earlier : pair.newer;
          const rendered = await renderPage(document, pageNumber, {
            scale: PREVIEW_SCALE,
            maxPixels: MAX_COMPARISON_PIXELS,
            maxDimension: 2800,
            signal,
          });
          const blank = blankImage(rendered.width, rendered.height);
          const oldImage = hasEarlier ? rendered.imageData : blank;
          const newImage = hasNewer ? rendered.imageData : blank;
          const result = diffImages(oldImage, newImage, {
            threshold: 0.08,
            includeAA: true,
            regionOptions: { minPixels: 8, maxRegions: 40 },
            signal,
          });
          const pageText = await extractPageText(document, pageNumber, { signal });
          const emptyPage = {
            pageNumber,
            width: rendered.widthPoints,
            height: rendered.heightPoints,
            items: [],
            text: "",
            hasText: false,
          } as const;
          const semantic = hasEarlier
            ? diffSemanticPages(pageText, emptyPage, { signal })
            : diffSemanticPages(emptyPage, pageText, { signal });
          const blankUrl = previewUrl(canvasFromImageData(blank));
          pages.push({
            index: pageNumber - 1,
            width: rendered.width,
            height: rendered.height,
            status: hasEarlier ? "removed" : "added",
            beforeSrc: hasEarlier ? previewUrl(rendered.canvas) : blankUrl,
            afterSrc: hasNewer ? previewUrl(rendered.canvas) : blankUrl,
            diffSrc: previewUrl(canvasFromImageData(result.overlay), "png"),
            changedPixels: result.changedPixels,
            changedPercent: result.changedPercent,
            regions: regionsForPage(result.regions, result.width, result.height),
            textChanges: textChangesFromSemantic(semantic),
            semantic,
            semanticBeforeOverlays: hasEarlier
              ? semanticOverlaysForPage(semantic.beforeOverlays, rendered, rendered.width, rendered.height)
              : [],
            semanticAfterOverlays: hasNewer
              ? semanticOverlaysForPage(semantic.afterOverlays, rendered, rendered.width, rendered.height)
              : [],
          });
        }
        onProgress?.({ completed: pageNumber, total: totalPages });
      }

      return {
        earlierName: earlier.name,
        newerName: newer.name,
        pages,
        elapsedMs: Math.round(performance.now() - startedAt),
      };
    } finally {
      await Promise.allSettled([pair.earlier.destroy(), pair.newer.destroy()]);
    }
  },
};
