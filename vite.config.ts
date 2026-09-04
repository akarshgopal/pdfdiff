import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

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
      const metadata = origin ? [
        `<link rel="canonical" href="${origin}/" />`,
        `<meta property="og:url" content="${origin}/" />`,
        `<meta property="og:image" content="${origin}/og.png" />`,
        `<meta name="twitter:image" content="${origin}/og.png" />`,
      ].join("\n    ") : "";
      return html.replace("<!-- absolute-site-metadata -->", metadata);
    },
  };
}

export default defineConfig(({ mode }) => {
  stagePdfJsAssets();
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      tailwindcss(),
      react(),
      absoluteMetadata(canonicalOrigin(env.VITE_SITE_URL)),
    ],
  };
});
