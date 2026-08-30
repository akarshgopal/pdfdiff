import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

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
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      ...(process.env.CODEX_SANDBOX === "seatbelt"
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      tailwindcss(),
      react(),
      absoluteMetadata(canonicalOrigin(env.VITE_SITE_URL)),
    ],
  };
});
