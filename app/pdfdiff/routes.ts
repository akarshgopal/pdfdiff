export type AppRoute = "home" | "privacy" | "terms" | "not-found";

export function appRouteFromPath(pathname: string): AppRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  if (path === "/privacy") return "privacy";
  if (path === "/terms") return "terms";
  return "not-found";
}

export const HOME_TITLE = "Compare two PDFs privately in your browser | pdfdiff";
export const HOME_DESCRIPTION =
  "Free, browser-based PDF compare. See text and drawing changes between two revisions, page by page. Files never leave your device — nothing is uploaded.";

export const ROUTE_DOCUMENT_META: Record<AppRoute, { title: string; description: string }> = {
  home: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  privacy: {
    title: "Privacy Policy — pdfdiff",
    description: "How pdfdiff handles PDF files, browser storage, and technical data.",
  },
  terms: {
    title: "Terms of Service — pdfdiff",
    description: "The terms that govern use of the pdfdiff browser-based PDF comparison service.",
  },
  "not-found": {
    title: "Page not found — pdfdiff",
    description: "This page does not exist on pdfdiff. Compare two PDFs privately in your browser.",
  },
};

export function applyDocumentMeta(route: AppRoute): void {
  const meta = ROUTE_DOCUMENT_META[route];
  document.title = meta.title;
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", meta.description);
}
