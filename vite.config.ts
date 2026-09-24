import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { SAMPLE_DOCUMENTS } from "./app/pdfdiff/sampleDocuments.ts";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * PDF.js fetches these on demand and, when they are missing, silently drops
 * JBIG2/JPX images and guesses metrics for non-embedded base-14 fonts — which
 * the raster diff then reports as changes that are not in the documents. Vite
 * serves `public/` in dev and copies it into `dist/` on build, so staging them
 * there covers both without a plugin hook.
 */
function stagePdfJsAssets(): void {
  const root = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  for (const dir of ["standard_fonts", "cmaps", "wasm", "iccs"]) {
    cpSync(path.join(root, dir), path.join("public/pdfjs", dir), { recursive: true });
  }
}

/**
 * Copy the three try-sample pairs into `public/samples/` so Vite serves them in
 * dev and emits them into `dist/` for the static Cloudflare deploy. Fetching
 * on click keeps the datasheet pair out of the JS bundle.
 */
function stageSamplePdfs(): void {
  for (const sample of SAMPLE_DOCUMENTS) {
    for (const side of [sample.earlier, sample.newer]) {
      const dest = path.join("public/samples", side.source);
      mkdirSync(path.dirname(dest), { recursive: true });
      cpSync(path.join("examples/pdf-fixtures", side.source), dest);
    }
  }
}

/** Agents probe `/llms.txt` at the site root; serve the CLI package's copy, not a second one. */
function stageLlmsTxt(): void {
  cpSync("packages/pdfdiff/llms.txt", "public/llms.txt");
}

function canonicalOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

const PRODUCTION_SITE_ORIGIN = "https://pdfdiff.app";

/** Swap the production origin when a preview/fork sets VITE_SITE_URL. */
export function rewriteAbsoluteSiteMetadata(text: string, origin: string | null): string {
  if (!origin || origin === PRODUCTION_SITE_ORIGIN) return text;
  return text.replaceAll(PRODUCTION_SITE_ORIGIN, origin);
}

function absoluteMetadata(origin: string | null): Plugin {
  return {
    name: "pdfdiff-absolute-metadata",
    transformIndexHtml(html) {
      return rewriteAbsoluteSiteMetadata(html, origin);
    },
    closeBundle() {
      if (!origin || origin === PRODUCTION_SITE_ORIGIN) return;
      for (const file of ["dist/robots.txt", "dist/sitemap.xml"]) {
        writeFileSync(file, rewriteAbsoluteSiteMetadata(readFileSync(file, "utf8"), origin));
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  stagePdfJsAssets();
  stageSamplePdfs();
  stageLlmsTxt();
  const env = loadEnv(mode, process.cwd(), "");
  return {
    // Multi-page: dev does not SPA-fallback unknown paths to the marketing index.
    // Production still does, via wrangler `not_found_handling` (see docs/mpa-unit1-notes.md).
    appType: "mpa",
    plugins: [tailwindcss(), react(), absoluteMetadata(canonicalOrigin(env.VITE_SITE_URL))],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(rootDir, "index.html"),
          privacy: path.resolve(rootDir, "privacy/index.html"),
          terms: path.resolve(rootDir, "terms/index.html"),
          app: path.resolve(rootDir, "app/index.html"),
        },
      },
    },
  };
});
