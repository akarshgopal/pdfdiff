import { StrictMode, useCallback } from "react";
import { createRoot } from "react-dom/client";
import type { DiffMetric } from "@pdfdiff/core";
import { PdfDiffApp } from "./app/pdfdiff/PdfDiffApp";
import "./app/globals.css";

declare global {
  interface Window {
    __PDFDIFF_METRICS__?: DiffMetric[];
  }
}

function App() {
  const recordMetric = useCallback((metric: DiffMetric): void => {
    window.__PDFDIFF_METRICS__?.push(metric);
  }, []);
  return <PdfDiffApp onMetric={window.__PDFDIFF_METRICS__ ? recordMetric : undefined} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
