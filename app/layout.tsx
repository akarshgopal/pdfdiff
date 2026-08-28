import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteName = "PDF Diff";
const pageTitle = "PDF Diff — compare documents privately";
const pageDescription = "Compare PDF revisions page by page. Your documents stay entirely in your browser.";
const faviconPath = "/favicon.svg";
const touchIconPath = "/apple-touch-icon.png";
const fallbackOrigin = "http://localhost:3000";

function requestOrigin(requestHeaders: Headers): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredOrigin) {
    try {
      const origin = new URL(configuredOrigin);
      if (origin.protocol === "http:" || origin.protocol === "https:") return origin.origin;
    } catch {
      return fallbackOrigin;
    }
  }
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  if (!host || (protocol !== "http" && protocol !== "https")) return fallbackOrigin;
  try {
    const origin = new URL(`${protocol}://${host}`);
    if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return fallbackOrigin;
    return origin.origin;
  } catch {
    return fallbackOrigin;
  }
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#fdf7ed",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const origin = requestOrigin(requestHeaders);

  return {
    metadataBase: new URL(origin),
    title: pageTitle,
    description: pageDescription,
    applicationName: siteName,
    authors: [{ name: siteName }],
    creator: siteName,
    publisher: siteName,
    category: "productivity",
    keywords: ["PDF comparison", "PDF diff", "document comparison", "visual diff"],
    referrer: "strict-origin-when-cross-origin",
    formatDetection: { telephone: false },
    alternates: { canonical: "/" },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: origin,
      siteName,
      type: "website",
      locale: "en_US",
      images: [{ url: "/og.png", width: 1731, height: 909, alt: "PDF Diff visual comparison" }],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: pageDescription,
      images: [{ url: "/og.png", alt: "PDF Diff visual comparison" }],
    },
    icons: {
      icon: [{ url: faviconPath, type: "image/svg+xml" }],
      shortcut: faviconPath,
      apple: [{ url: touchIconPath, sizes: "180x180", type: "image/png" }],
    },
    manifest: "/site.webmanifest",
    appleWebApp: {
      capable: true,
      title: siteName,
      statusBarStyle: "default",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { let savedTheme = null; try { savedTheme = window.localStorage.getItem("pdfdiff-theme"); } catch {} const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches; document.documentElement.classList.toggle("dark", savedTheme === "dark" || (!savedTheme && prefersDark)); })();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
