export type AppRoute = "home" | "app" | "privacy" | "terms" | "not-found";

export function appRouteFromPath(pathname: string): AppRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  if (path === "/app") return "app";
  if (path === "/privacy") return "privacy";
  if (path === "/terms") return "terms";
  return "not-found";
}

export const HOME_TITLE = "Compare two PDFs privately in your browser | pdfdiff";
export const HOME_DESCRIPTION =
  "Free, browser-based PDF compare. See text and drawing changes between two revisions, page by page. Files never leave your device. Nothing is uploaded.";

export const APP_TITLE = "Compare PDFs in your browser | pdfdiff";
export const APP_DESCRIPTION =
  "Upload two PDF revisions and see text and drawing changes page by page. Files never leave your device. Nothing is uploaded.";

export const ROUTE_DOCUMENT_META: Record<AppRoute, { title: string; description: string }> = {
  home: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  app: {
    title: APP_TITLE,
    description: APP_DESCRIPTION,
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

export const INDEXABLE_ROBOTS = "index, follow, max-image-preview:large";
export const NOT_FOUND_ROBOTS = "noindex, follow";

export function canonicalPathForRoute(route: AppRoute, pathname: string): string {
  if (route === "home") return "/";
  if (route === "app") return "/app";
  if (route === "privacy") return "/privacy";
  if (route === "terms") return "/terms";
  return pathname.replace(/\/+$/, "") || "/";
}

export function documentMetaForRoute(
  route: AppRoute,
  origin: string,
  pathname: string,
): {
  title: string;
  description: string;
  canonicalUrl: string;
  robots: string;
} {
  const meta = ROUTE_DOCUMENT_META[route];
  return {
    title: meta.title,
    description: meta.description,
    canonicalUrl: `${origin}${canonicalPathForRoute(route, pathname)}`,
    robots: route === "not-found" ? NOT_FOUND_ROBOTS : INDEXABLE_ROBOTS,
  };
}

function siteOrigin(): string {
  const href = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  if (href) {
    try {
      return new URL(href).origin;
    } catch {
      // Fall through to the page origin when the HTML tag is not a URL.
    }
  }
  return window.location.origin;
}

function setAttr(selector: string, attr: string, value: string): void {
  document.querySelector(selector)?.setAttribute(attr, value);
}

/**
 * Sets title, description, canonical, and social tags for one route.
 * Only the compare workspace (`/app`) calls this. Landing and legal pages
 * ship those tags in their HTML files.
 */
export function applyDocumentMeta(route: AppRoute): void {
  const next = documentMetaForRoute(route, siteOrigin(), window.location.pathname);
  document.title = next.title;
  setAttr('meta[name="description"]', "content", next.description);
  setAttr('meta[property="og:description"]', "content", next.description);
  setAttr('meta[name="twitter:description"]', "content", next.description);
  setAttr('link[rel="canonical"]', "href", next.canonicalUrl);
  setAttr('meta[property="og:url"]', "content", next.canonicalUrl);
  setAttr('meta[property="og:title"]', "content", next.title);
  setAttr('meta[name="twitter:title"]', "content", next.title);
  setAttr('meta[name="robots"]', "content", next.robots);
}
