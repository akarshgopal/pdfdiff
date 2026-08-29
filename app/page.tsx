"use client";

import { useCallback } from "react";
import type { DiffMetric } from "@pdfdiff/core";
import { PdfDiffApp } from "./pdfdiff/PdfDiffApp";

declare global {
  interface Window {
    __PDFDIFF_METRICS__?: DiffMetric[];
  }
}

export default function Home() {
  const recordMetric = useCallback((metric: DiffMetric): void => {
    window.__PDFDIFF_METRICS__?.push(metric);
  }, []);
  const metricsEnabled = typeof window !== "undefined" && Boolean(window.__PDFDIFF_METRICS__);
  return <PdfDiffApp onMetric={metricsEnabled ? recordMetric : undefined} />;
}
