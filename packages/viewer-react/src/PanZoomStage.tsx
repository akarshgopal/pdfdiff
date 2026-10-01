import { type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { styles, cx } from "./styles.js";
import { clampZoom } from "./viewer-utils.js";

function stageBox(stage: HTMLElement): { width: number; height: number } {
  const padding = parseFloat(getComputedStyle(stage).paddingLeft) || 0;
  return { width: stage.clientWidth - padding * 2, height: stage.clientHeight - padding * 2 };
}

/** 100% zoom shows the whole page, whatever the mode lays out; zoom scales up from there. */
function fitScale(stage: HTMLElement, content: HTMLElement): number {
  if (!content.offsetWidth || !content.offsetHeight) return 1;
  const { width, height } = stageBox(stage);
  return Math.min(width / content.offsetWidth, height / content.offsetHeight);
}

export function PanZoomStage({
  zoom,
  onZoomChange,
  resetKey,
  children,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  resetKey: string;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; panX: number; panY: number } | null>(
    null,
  );
  /** Touch points on the stage; two of them make a pinch. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number; midX: number; midY: number } | null>(null);
  const [panning, setPanning] = useState(false);

  // The transform is written straight to the node. Scaling a composited layer
  // costs no relayout, and panning this way costs no React render either.
  const applyTransform = useCallback((zoomPercent: number) => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return;
    const { width, height } = stageBox(stage);
    const scale = (fitScale(stage, content) * zoomPercent) / 100;
    const overflowX = Math.max(0, (content.offsetWidth * scale - width) / 2);
    const overflowY = Math.max(0, content.offsetHeight * scale - height);
    const { x, y } = panRef.current;
    panRef.current = { x: Math.max(-overflowX, Math.min(overflowX, x)), y: Math.max(-overflowY, Math.min(0, y)) };
    content.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${scale})`;
  }, []);

  useEffect(() => applyTransform(zoom), [zoom, applyTransform]);
  useEffect(() => {
    panRef.current = { x: 0, y: 0 };
    applyTransform(zoom);
    // A new page or view starts centred; keeping the old pan would land the
    // reviewer somewhere off the page.
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Page images arrive after layout and the window resizes, both of which move
  // the fit, so the scale is recomputed whenever either box changes.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  });
  useEffect(() => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return;
    const observer = new ResizeObserver(() => applyTransform(zoomRef.current));
    observer.observe(stage);
    observer.observe(content);
    return () => observer.disconnect();
  }, [applyTransform]);

  // Hold the point at (clientX, clientY) still while zooming. The shift is its
  // distance from the transform origin times the scale change — and the origin
  // is the top edge but the horizontal centre, so x measures from the middle.
  const zoomAt = (clientX: number, clientY: number, nextZoom: number) => {
    const content = contentRef.current;
    // zoomRef, not the prop: a pinch fires several moves per render, and each
    // must start from the scale the previous one already applied.
    const current = zoomRef.current;
    if (!content || nextZoom === current) return;
    const rect = content.getBoundingClientRect();
    const shrink = 1 - nextZoom / current;
    panRef.current = {
      x: panRef.current.x + (clientX - rect.left - rect.width / 2) * shrink,
      y: panRef.current.y + (clientY - rect.top) * shrink,
    };
    zoomRef.current = nextZoom;
    applyTransform(nextZoom);
    onZoomChange(nextZoom);
  };

  // React attaches onWheel as a passive root listener, where preventDefault is
  // ignored, so the zoom handler owns a non-passive listener on the stage.
  const handleWheel = (event: globalThis.WheelEvent) => {
    const content = contentRef.current;
    if (!content) return;
    if (!event.ctrlKey && !event.metaKey) {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (stageRef.current?.clientHeight ?? 1) : 1;
      panRef.current = { x: panRef.current.x - event.deltaX * unit, y: panRef.current.y - event.deltaY * unit };
      applyTransform(zoom);
      return;
    }
    zoomAt(event.clientX, event.clientY, clampZoom(Math.round((zoom * Math.exp(-event.deltaY * 0.0015)) / 5) * 5));
  };
  const wheelHandler = useRef(handleWheel);
  useEffect(() => {
    wheelHandler.current = handleWheel;
  });
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const listener = (event: globalThis.WheelEvent): void => {
      event.preventDefault();
      wheelHandler.current(event);
    };
    stage.addEventListener("wheel", listener, { passive: false });
    return () => stage.removeEventListener("wheel", listener);
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, input, select, a, [role='slider']")) return;
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    const pointers = pointersRef.current;
    if (event.pointerType === "touch") pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      // A second finger turns the drag into a pinch.
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinchRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    setPanning(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    const pinch = pinchRef.current;
    if (pinch && pointers.has(event.pointerId)) {
      event.preventDefault();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      // Moving both fingers together pans; spreading them zooms about their midpoint.
      panRef.current = { x: panRef.current.x + midX - pinch.midX, y: panRef.current.y + midY - pinch.midY };
      pinch.midX = midX;
      pinch.midY = midY;
      applyTransform(zoomRef.current);
      zoomAt(midX, midY, clampZoom((pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance));
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    panRef.current = { x: drag.panX + (event.clientX - drag.clientX), y: drag.panY + (event.clientY - drag.clientY) };
    applyTransform(zoom);
  };

  const stopPanning = (event: PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    // ponytail: lifting one finger ends the pinch without resuming a one-finger pan; lift and touch again to pan.
    if (pointersRef.current.delete(event.pointerId) && pinchRef.current) {
      pinchRef.current = null;
      if (stage?.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      setPanning(false);
      return;
    }
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (stage?.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setPanning(false);
  };

  return (
    <div
      ref={stageRef}
      className={cx(styles.stage, panning && styles.stagePanning)}
      aria-label="Document canvas. Scroll to pan, pinch or Ctrl-scroll to zoom."
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPanning}
      onPointerCancel={stopPanning}
    >
      <div className={styles.stageCenter}>
        <div ref={contentRef} className={styles.stageContent}>
          {children}
        </div>
      </div>
    </div>
  );
}
