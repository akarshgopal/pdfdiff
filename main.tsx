import { StrictMode, useCallback } from "react";
import { createRoot } from "react-dom/client";
import type { DiffMetric } from "@pdfdiff/core";
import { PdfDiffApp } from "./app/pdfdiff/PdfDiffApp";
import { LegalPage } from "./app/pdfdiff/LegalPage";
import "./app/globals.css";

declare global {
  interface Window {
    __PDFDIFF_METRICS__?: DiffMetric[];
  }
}

const route = window.location.pathname.replace(/\/+$/, "") || "/";

function App() {
  const recordMetric = useCallback((metric: DiffMetric): void => {
    window.__PDFDIFF_METRICS__?.push(metric);
  }, []);
  if (route === "/privacy") return <LegalPage kind="privacy" />;
  if (route === "/terms") return <LegalPage kind="terms" />;
  return <PdfDiffApp onMetric={window.__PDFDIFF_METRICS__ ? recordMetric : undefined} />;
}

if (route === "/privacy" || route === "/terms") {
  const privacy = route === "/privacy";
  document.title = `${privacy ? "Privacy Policy" : "Terms of Service"} — pdfdiff`;
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute(
    "content",
    privacy ? "How pdfdiff handles PDF files, browser storage, and technical data." : "The terms that govern use of the pdfdiff browser-based PDF comparison service.",
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
