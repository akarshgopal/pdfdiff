import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { SAMPLE_DOCUMENTS } from "./app/pdfdiff/sampleDocuments.ts";

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

function absoluteMetadata(origin: string | null): Plugin {
  return {
    name: "pdfdiff-absolute-metadata",
    transformIndexHtml(html) {
      const metadata = origin
        ? [
            `<link rel="canonical" href="${origin}/" />`,
            `<meta property="og:url" content="${origin}/" />`,
            `<meta property="og:image" content="${origin}/og.png" />`,
            `<meta name="twitter:image" content="${origin}/og.png" />`,
          ].join("\n    ")
        : "";
      return html.replace("<!-- absolute-site-metadata -->", metadata);
    },
  };
}

export default defineConfig(({ mode }) => {
  stagePdfJsAssets();
  stageSamplePdfs();
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [tailwindcss(), react(), absoluteMetadata(canonicalOrigin(env.VITE_SITE_URL))],
  };
});
