import { AnnotationMode, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  STANDARD_RENDER_MAX_DIMENSION,
  STANDARD_RENDER_MAX_PIXELS,
  STANDARD_RENDER_SCALE,
  boundedRenderSize,
  pageCenterOffset,
  type RenderedPage,
} from "@pdfdiff/core";
import type { LoadedPdf } from "./pdf.js";

const BACKGROUND = "rgb(255, 255, 255)";

interface CanvasAndContext {
  canvas: { width: number; height: number };
  context: {
    fillStyle: string;
    fillRect(x: number, y: number, width: number, height: number): void;
    getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
  };
}

interface CanvasFactory {
  create(width: number, height: number): CanvasAndContext;
  destroy(canvasAndContext: CanvasAndContext): void;
}

function canvasFactoryOf(pdf: LoadedPdf): CanvasFactory {
  return pdf.pdf.canvasFactory as CanvasFactory;
}

async function renderIntoCanvas(
  pdf: LoadedPdf,
  page: PDFPageProxy,
  width: number,
  height: number,
  scale: number,
  viewport1: { width: number; height: number },
): Promise<RenderedPage> {
  const factory = canvasFactoryOf(pdf);
  const { offsetX, offsetY } = pageCenterOffset(width, height, viewport1.width, viewport1.height, scale);
  const canvasAndContext = factory.create(width, height);
  const { canvas, context } = canvasAndContext;
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const viewport = page.getViewport({ scale, rotation: page.rotate });
  try {
    await page.render({
      canvas: canvas as never,
      canvasContext: context as never,
      viewport,
      transform: [1, 0, 0, 1, offsetX, offsetY],
      background: BACKGROUND,
      annotationMode: AnnotationMode.ENABLE,
    }).promise;
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
      pageNumber: page.pageNumber,
      width: canvas.width,
      height: canvas.height,
      data: new Uint8ClampedArray(imageData.data),
      widthPoints: viewport1.width,
      heightPoints: viewport1.height,
      rotation: page.rotate,
      scale,
    };
  } finally {
    factory.destroy(canvasAndContext);
  }
}

function batchSize(widthPoints: number, heightPoints: number) {
  return boundedRenderSize(
    widthPoints,
    heightPoints,
    STANDARD_RENDER_SCALE,
    STANDARD_RENDER_MAX_PIXELS,
    STANDARD_RENDER_MAX_DIMENSION,
  );
}

/** Render one page into a bounded canvas. */
export async function renderPage(pdf: LoadedPdf, pageNumber: number): Promise<RenderedPage> {
  const page = await pdf.pdf.getPage(pageNumber);
  const viewport1 = page.getViewport({ scale: 1, rotation: page.rotate });
  const { width, height, scale } = batchSize(viewport1.width, viewport1.height);
  return renderIntoCanvas(pdf, page, width, height, scale, viewport1);
}

/** Render corresponding pages onto one normalized pixel grid. */
export async function renderPagePair(
  earlier: LoadedPdf,
  newer: LoadedPdf,
  earlierPageNumber: number,
  newerPageNumber: number,
): Promise<{ earlier: RenderedPage; newer: RenderedPage }> {
  const [earlierPage, newerPage] = await Promise.all([
    earlier.pdf.getPage(earlierPageNumber),
    newer.pdf.getPage(newerPageNumber),
  ]);
  const earlierViewport = earlierPage.getViewport({ scale: 1, rotation: earlierPage.rotate });
  const newerViewport = newerPage.getViewport({ scale: 1, rotation: newerPage.rotate });
  const { width, height, scale } = batchSize(
    Math.max(earlierViewport.width, newerViewport.width),
    Math.max(earlierViewport.height, newerViewport.height),
  );
  const [earlierRendered, newerRendered] = await Promise.all([
    renderIntoCanvas(earlier, earlierPage, width, height, scale, earlierViewport),
    renderIntoCanvas(newer, newerPage, width, height, scale, newerViewport),
  ]);
  return { earlier: earlierRendered, newer: newerRendered };
}
