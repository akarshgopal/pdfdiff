import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createPdfJsEngine, type RenderQuality } from "@pdfdiff/pdfjs-browser";
import type { ComparisonPage, ComparisonResult, RasterImage, VisualPageGeometry } from "@pdfdiff/core";
import type { DiffComparison, DiffPage, DiffSemanticOverlay, DiffRegion, DiffTextChange } from "@pdfdiff/viewer-react";
import type { PdfDiffEngine } from "./pdfdiff/PdfDiffApp";
import { describeRegions } from "./pdfdiff/regionLabels";

const MAX_VIEWER_TEXT_CHANGES = 80;
const MAX_VIEWER_SEMANTIC_OVERLAYS = 160;

function imageDataFromRaster(image: RasterImage): ImageData {
  return new ImageData(image.data as ImageDataArray, image.width, image.height);
}

async function imageUrl(image: RasterImage, format: "webp" | "png" = "webp", alpha = false): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  // The overlay masks carry their tint strength in the alpha channel, so those
  // must not be flattened onto an opaque canvas.
  const context = canvas.getContext("2d", { alpha });
  if (!context) throw new Error("Your browser does not provide a 2D canvas context.");
  context.putImageData(imageDataFromRaster(image), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Unable to encode a comparison preview."))),
      format === "png" ? "image/png" : "image/webp",
      0.9,
    );
  });
  const url = URL.createObjectURL(blob);
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

/** Regions arrive in overlay pixels; the viewer and the overlays both use page-relative percentages. */
function regionsForPage(page: ComparisonPage, overlays: readonly DiffSemanticOverlay[]): DiffRegion[] {
  const width = page.width ?? 1;
  const height = page.height ?? 1;
  return describeRegions(
    (page.regions ?? []).map((region) => ({
      id: String(region.id),
      x: (region.x / width) * 100,
      y: (region.y / height) * 100,
      width: (region.width / width) * 100,
      height: (region.height / height) * 100,
      changeClass: region.changeClass,
    })),
    overlays,
  );
}

function textChangesForPage(page: ComparisonPage): DiffTextChange[] {
  return (page.semantic?.changes ?? []).slice(0, MAX_VIEWER_TEXT_CHANGES).map((change) => ({
    id: change.id,
    text:
      change.kind === "changed"
        ? `${change.before} → ${change.after}`
        : change.kind === "removed"
          ? change.before
          : change.after,
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
  const overlays = side === "earlier" ? (page.semantic?.beforeOverlays ?? []) : (page.semantic?.afterOverlays ?? []);
  const geometry = page.visualGeometry?.[side];
  return overlays.slice(0, MAX_VIEWER_SEMANTIC_OVERLAYS).map((overlay) => ({
    id: overlay.id,
    kind: overlay.kind,
    text: overlay.text,
    quads: overlay.quads.map((quad) => normalizedQuad(quad, geometry, page.width ?? 1, page.height ?? 1)),
  }));
}

async function toViewerPage(page: ComparisonPage): Promise<DiffPage> {
  const layerSources = page.diffLayers;
  const [beforeSrc, afterSrc, diffSrc, base, added, removed, modified] = await Promise.all([
    page.earlier ? imageUrl(page.earlier) : undefined,
    page.newer ? imageUrl(page.newer) : undefined,
    page.diff ? imageUrl(page.diff, "png") : undefined,
    layerSources ? imageUrl(layerSources.base, "webp") : undefined,
    layerSources ? imageUrl(layerSources.added, "png", true) : undefined,
    layerSources ? imageUrl(layerSources.removed, "png", true) : undefined,
    layerSources ? imageUrl(layerSources.modified, "png", true) : undefined,
  ]);
  const layers = base && added && removed && modified ? { base, added, removed, modified } : undefined;
  const semanticBeforeOverlays = semanticOverlaysForPage(page, "earlier");
  const semanticAfterOverlays = semanticOverlaysForPage(page, "newer");
  return {
    index: page.index,
    earlierPageNumber: page.earlierPageNumber,
    newerPageNumber: page.newerPageNumber,
    alignment: page.alignment,
    similarity: page.similarity,
    width: page.width,
    height: page.height,
    status: page.status,
    beforeSrc,
    afterSrc,
    diffSrc,
    layers,
    changedPixels: page.changedPixels,
    changedPercent: page.changedPercent,
    regions: regionsForPage(page, [...semanticBeforeOverlays, ...semanticAfterOverlays]),
    changeClasses: page.changeClasses,
    noticeable: page.noticeable,
    textChanges: textChangesForPage(page),
    textChangeCount: page.semantic?.changes.length ?? 0,
    semantic: page.semantic,
    semanticBeforeOverlays,
    semanticAfterOverlays,
    error: page.error,
  };
}

function pageUrls(page: DiffPage): string[] {
  return [
    page.beforeSrc,
    page.afterSrc,
    page.diffSrc,
    page.layers?.base,
    page.layers?.added,
    page.layers?.removed,
    page.layers?.modified,
  ].filter((url): url is string => Boolean(url));
}

type RawPagePairResolver = (request: {
  earlierPageIndex: number;
  newerPageIndex: number;
  quality?: RenderQuality;
  signal: AbortSignal;
}) => Promise<ComparisonPage>;

async function toViewerComparison(
  result: ComparisonResult,
  resolveRawPagePair?: RawPagePairResolver,
  convertedPages = new Map<number, DiffPage>(),
  urls = new Set<string>(),
): Promise<DiffComparison> {
  const pages = await Promise.all(result.pages.map((page) => convertedPages.get(page.index) ?? toViewerPage(page)));
  const pairCache = new Map<string, DiffPage>();
  let disposed = false;
  const trackPageUrls = (page: DiffPage): void => {
    for (const url of pageUrls(page)) {
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
    comparePagePair: resolveRawPagePair
      ? async (request) => {
          if (request.signal.aborted) throw new DOMException("The page comparison was aborted.", "AbortError");
          const key = `${request.earlierPageIndex}:${request.newerPageIndex}:${request.quality ?? "standard"}`;
          const cached = pairCache.get(key);
          if (cached) return cached;
          const page = await toViewerPage(await resolveRawPagePair(request));
          if (request.signal.aborted) {
            for (const url of pageUrls(page)) URL.revokeObjectURL(url);
            throw new DOMException("The page comparison was aborted.", "AbortError");
          }
          trackPageUrls(page);
          pairCache.set(key, page);
          return page;
        }
      : undefined,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      pairCache.clear();
    },
  };
}

/** Vite stages these into `public/pdfjs/`; the site is served from the root. */
const engine = createPdfJsEngine({
  workerSrc: workerUrl,
  assetBaseUrl: "/pdfjs/",
  createRasterDiffWorker: () => new Worker(new URL("./rasterDiffWorker.ts", import.meta.url), { type: "module" }),
});

export const browserPdfDiffEngine: PdfDiffEngine = {
  async compare(request) {
    const convertedPages = new Map<number, DiffPage>();
    const urls = new Set<string>();
    const revokePage = (page: DiffPage): void => {
      for (const url of pageUrls(page)) URL.revokeObjectURL(url);
    };
    try {
      const result = await engine.compare({
        ...request,
        onReady: (event) =>
          request.onReady?.({
            earlierName: event.earlierName ?? "Earlier PDF",
            newerName: event.newerName ?? "Newer PDF",
            earlierPageCount: event.earlierPageCount,
            newerPageCount: event.newerPageCount,
            total: event.total,
          }),
        onPage: async (rawPage) => {
          const page = await toViewerPage(rawPage);
          if (request.signal.aborted) {
            revokePage(page);
            throw new DOMException("The comparison was aborted.", "AbortError");
          }
          convertedPages.set(page.index, page);
          for (const url of pageUrls(page)) urls.add(url);
          request.onPage?.(page);
        },
      });
      const comparison = await toViewerComparison(
        result,
        ({ earlierPageIndex, newerPageIndex, quality, signal }) =>
          engine.comparePagePair({
            earlier: request.earlier,
            newer: request.newer,
            earlierPageIndex,
            newerPageIndex,
            options: request.options,
            quality,
            signal,
            onMetric: request.onMetric,
          }),
        convertedPages,
        urls,
      );
      return {
        ...comparison,
        earlierPageCount: result.pages.reduce(
          (count, page) => (page.earlierPageNumber !== undefined ? count + 1 : count),
          0,
        ),
        newerPageCount: result.pages.reduce(
          (count, page) => (page.newerPageNumber !== undefined ? count + 1 : count),
          0,
        ),
      };
    } catch (error) {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      throw error;
    }
  },
};
