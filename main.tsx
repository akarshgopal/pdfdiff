import { StrictMode, useCallback } from "react";
import { createRoot } from "react-dom/client";
import type { DiffMetric } from "@pdfdiff/core";
import { PdfDiffApp } from "./app/pdfdiff/PdfDiffApp";
import { LegalPage } from "./app/pdfdiff/LegalPage";
import { NotFoundPage } from "./app/pdfdiff/NotFoundPage";
import { applyDocumentMeta, appRouteFromPath } from "./app/pdfdiff/routes";
import "./app/globals.css";

declare global {
  interface Window {
    __PDFDIFF_METRICS__?: DiffMetric[];
  }
}

const route = appRouteFromPath(window.location.pathname);
applyDocumentMeta(route);

function App() {
  const recordMetric = useCallback((metric: DiffMetric): void => {
    window.__PDFDIFF_METRICS__?.push(metric);
  }, []);
  if (route === "privacy") return <LegalPage kind="privacy" />;
  if (route === "terms") return <LegalPage kind="terms" />;
  if (route === "not-found") return <NotFoundPage />;
  return <PdfDiffApp onMetric={window.__PDFDIFF_METRICS__ ? recordMetric : undefined} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
