/**
 * Post-Vite step: emit unique crawlable HTML for /, /privacy, and /terms.
 *
 * Cloudflare Pages serves dist/privacy/index.html and dist/terms/index.html when
 * those files exist, even with not_found_handling: single-page-application.
 * Each file keeps the Vite-hashed assets so React still mounts over #root.
 *
 * Meta strings match app/pdfdiff/routes.ts (ROUTE_DOCUMENT_META). Legal copy
 * mirrors app/pdfdiff/LegalPage.tsx as simplified semantic HTML.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const UPDATED_AT = "September 5, 2026";

const ROUTE_META = {
  home: {
    title: "Compare two PDFs privately in your browser | pdfdiff",
    description:
      "Free, browser-based PDF compare. See text and drawing changes between two revisions, page by page. Files never leave your device. Nothing is uploaded.",
    path: "/",
  },
  privacy: {
    title: "Privacy Policy — pdfdiff",
    description: "How pdfdiff handles PDF files, browser storage, and technical data.",
    path: "/privacy",
  },
  terms: {
    title: "Terms of Service — pdfdiff",
    description: "The terms that govern use of the pdfdiff browser-based PDF comparison service.",
    path: "/terms",
  },
};

function escapeAttr(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function mustReplace(html, pattern, replacement, label) {
  if (!html.match(pattern)) throw new Error(`prerender-seo: failed to replace ${label}`);
  return html.replace(pattern, replacement);
}

function originFromCanonical(html) {
  const match = html.match(/rel="canonical" href="(https?:\/\/[^"]+)"/);
  if (!match) throw new Error("prerender-seo: dist/index.html is missing a canonical URL");
  return new URL(match[1]).origin;
}

function setMeta(html, attr, value, content) {
  const pattern = new RegExp(`(<meta\\s+${attr}="${value}"\\s+content=")[^"]*(")`);
  return mustReplace(html, pattern, `$1${escapeAttr(content)}$2`, `meta ${attr}="${value}"`);
}

function applyRouteMeta(html, { title, description, canonicalUrl, keepJsonLd }) {
  let out = html;
  out = mustReplace(out, /<title>[^<]*<\/title>/, `<title>${escapeAttr(title)}</title>`, "title");
  out = setMeta(out, "name", "description", description);
  out = setMeta(out, "property", "og:title", title);
  out = setMeta(out, "property", "og:description", description);
  out = setMeta(out, "property", "og:url", canonicalUrl);
  out = setMeta(out, "name", "twitter:title", title);
  out = setMeta(out, "name", "twitter:description", description);
  out = mustReplace(out, /(<link rel="canonical" href=")[^"]*(")/, `$1${escapeAttr(canonicalUrl)}$2`, "canonical");
  if (!keepJsonLd) {
    out = mustReplace(
      out,
      /\n?\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      "",
      "WebApplication JSON-LD",
    );
  }
  return out;
}

function findRootClose(html, innerStart) {
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = innerStart;
  let depth = 1;
  let match;
  while ((match = re.exec(html))) {
    const isClose = match[0].startsWith("</");
    if (isClose) {
      depth -= 1;
      if (depth === 0) return match.index;
    } else if (!match[0].endsWith("/>")) {
      depth += 1;
    }
  }
  throw new Error("prerender-seo: unclosed #root");
}

function replaceRootInner(html, inner) {
  const open = html.match(/<div id="root"[^>]*>/);
  if (!open) throw new Error('prerender-seo: missing <div id="root">');
  const start = html.indexOf(open[0]);
  const innerStart = start + open[0].length;
  const close = findRootClose(html, innerStart);
  const pad = "      ";
  const indented = inner
    .trim()
    .split("\n")
    .map((line) => (line.length ? pad + line : ""))
    .join("\n");
  return `${html.slice(0, innerStart)}\n${indented}\n    ${html.slice(close)}`;
}

function mailto(address, subject, label = address) {
  return `<a href="mailto:${address}?subject=${subject}">${label}</a>`;
}

function section(title, ...blocks) {
  return `<section>
  <h2>${title}</h2>
  ${blocks.join("\n  ")}
</section>`;
}

function footerNav() {
  return `<footer>
  <nav aria-label="Footer">
    <a href="/terms">Terms of service</a>
    <a href="/privacy">Privacy policy</a>
    <a href="https://www.npmjs.com/package/@pdfdiff/cli" rel="noopener noreferrer">CLI on npm</a>
    <a href="mailto:akarsh@pdfdiff.app?subject=PDF%20Diff%20contact">Contact</a>
  </nav>
</footer>`;
}

function legalShell(title, body) {
  return `<main>
  <p><a href="/">← Back to pdfdiff</a></p>
  <header>
    <p>Legal</p>
    <h1>${title}</h1>
    <p>Last updated ${UPDATED_AT}</p>
  </header>
  ${body}
  ${footerNav()}
</main>`;
}

const HOME_BODY = `<main>
  <h1>Compare PDFs. See what changed.</h1>
  <p>
    Overlay two revisions page by page, text and drawings. Files are compared in this browser and never uploaded.
  </p>
  <ul>
    <li>Compare two PDF revisions page by page</li>
    <li>Visual overlay of text and drawing changes</li>
    <li>Runs entirely in the browser</li>
    <li>Files never leave the device</li>
    <li>No account required</li>
  </ul>
  <p>
    Free, browser-based PDF compare. See text and drawing changes between two revisions, page by page. Files never
    leave your device. Nothing is uploaded.
  </p>
  <h2>Run headless with @pdfdiff/cli</h2>
  <p><code>npx @pdfdiff/cli earlier.pdf newer.pdf</code></p>
  <nav>
    <a href="/privacy">Privacy policy</a>
    <a href="/terms">Terms of service</a>
  </nav>
</main>`;

const PRIVACY_BODY = legalShell(
  "Privacy Policy",
  `<p>
  <strong>Short version:</strong> your PDFs are processed locally in your browser and never uploaded. If you
  choose to remember a comparison, local copies stay on that device.
</p>
${section(
  "Who is responsible",
  `<p>
    pdfdiff is operated by Akarsh Gopal. For privacy questions or requests, email
    ${mailto("akarsh@pdfdiff.app", "Privacy%20request")}.
  </p>`,
)}
${section(
  "PDF processing",
  `<p>
    When you select PDFs, the files are opened, rendered, and compared by code running on your device. Their
    contents stay there. Unless you opt in to remembering them, the active comparison remains only in browser
    memory while you use the page and is released when you start over or close the page.
  </p>`,
  `<p>
    Files compared in the browser never reach the operator, so they cannot be accessed, corrected, deleted, or
    produced from here. You are responsible for making sure you are permitted to process the documents you select,
    particularly documents containing confidential or personal information.
  </p>`,
)}
${section(
  "Information stored on your device",
  `<p>pdfdiff uses browser storage for three functional purposes:</p>`,
  `<ul>
    <li>
      <strong>Saved comparisons:</strong> if you select “Remember these PDFs in this browser,” IndexedDB stores
      local copies of both PDFs together with their filenames, sizes, settings, and save date. Up to six
      comparisons are kept. You can delete every copy with “Clear history” or your browser’s site-data controls.
    </li>
    <li>
      <strong>Theme:</strong> local storage remembers whether you selected light or dark mode.
    </li>
    <li>
      <strong>Overlay colours:</strong> local storage remembers the highlight colours you chose for added, removed,
      and unchanged regions.
    </li>
  </ul>`,
  `<p>
    Saved comparisons are opt in and the checkbox is off by default. Theme and overlay choices stay on your
    device. pdfdiff has no advertising identifiers, tracking pixels, or analytics cookies. The host may set
    strictly necessary security cookies to deliver and protect the site.
  </p>`,
)}
${section(
  "Website delivery and technical data",
  `<p>
    The website is delivered through Cloudflare. Like any website host, Cloudflare receives technical request
    information such as your IP address, browser and device details, requested URL, and request time. This data
    may be processed to deliver the site, protect it from abuse, and maintain reliability. PDF contents are not
    included in these requests.
  </p>`,
  `<p>
    The site has no product-analytics or advertising service, and personal information is not sold or shared for
    targeted advertising. Cloudflare describes its processing and international transfer safeguards in its
    <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Privacy Policy</a>.
  </p>`,
)}
${section(
  "Messages you send",
  `<p>
    Email to the address above includes your email address and whatever you write. It is used to respond, resolve
    issues, and keep records reasonably needed for those purposes or for legal obligations. Leave confidential
    PDFs out of feedback messages.
  </p>`,
)}
${section(
  "Legal bases and sharing",
  `<p>
    Where the GDPR applies, technical data is processed as necessary to provide the service and for the legitimate
    interests of operating and securing the site. Messages are processed to respond to your request and for those
    same legitimate interests. Information may also be processed where required by law.
  </p>`,
  `<p>
    Information is disclosed only to the providers needed to operate the website or email, when required by law,
    or to protect rights and security. A lawful request can be considered when it concerns information actually
    held here — for example an email you sent. Compared PDFs never become those records.
  </p>`,
)}
${section(
  "Your rights",
  `<p>
    Depending on where you live, you may have rights to access, correct, delete, restrict, or object to processing
    of your personal data, and to receive portable data. You may also complain to your local data-protection
    authority. Contact the address above to exercise a right in data held by the operator.
  </p>`,
  `<p>Data kept only in your browser can be managed with “Clear history” or your browser’s site-data controls.</p>`,
)}
${section(
  "Children and changes",
  `<p>
    pdfdiff is intended for people 16 and older. The policy may be updated when the service or applicable
    requirements change. The date above shows the latest revision.
  </p>`,
)}`,
);

const TERMS_BODY = legalShell(
  "Terms of Service",
  `<p>
  These terms govern your use of pdfdiff. By using the site, you agree to them. If you do not agree, do not use
  the site.
</p>
${section(
  "The service",
  `<p>
    pdfdiff is a browser-based tool for comparing two PDF revisions. It can highlight visual and textual
    differences, align pages, and export a summary. Processing happens on your device.
  </p>`,
  `<p>
    The site is provided without an account and currently without charge. It may be improved, changed, suspended,
    or discontinued. Support and uptime are not promised.
  </p>`,
  `<p>
    These terms apply to this website. Source code is offered separately under the MIT License; running your own
    copy is covered by that licence.
  </p>`,
)}
${section(
  "Your documents",
  `<p>
    You keep all rights in the documents you select. Selecting a file grants no rights in it to the operator,
    because the file stays on your device.
  </p>`,
  `<p>
    Use pdfdiff only with documents you are legally permitted to access and process. You are responsible for
    protecting confidential information on your device, for the files you choose to open, and for reviewing the
    comparison before relying on it. Opening a PDF still runs a renderer on your device.
  </p>`,
)}
${section(
  "Notices",
  `<p>
    Compared PDFs are never hosted, stored, or transmitted to the site. There is nothing here to take down or
    produce, and no copy from which to decide who may use a document. Complaints about a file someone compared
    belong with the person who has that file.
  </p>`,
  `<p>
    If the pdfdiff website or software itself is the issue, email
    ${mailto("akarsh@pdfdiff.app", "Legal%20notice")} with enough detail to identify the material. Incomplete,
    automated, or bulk notices may go unanswered.
  </p>`,
)}
${section(
  "Acceptable use",
  `<p>
    Do not misuse the site, attempt to disrupt or bypass its security, interfere with other people using it, send
    automated traffic that burdens the host, or use the site in violation of law or another person’s rights.
  </p>`,
)}
${section(
  "Accuracy and professional review",
  `<p>
    PDF comparison is imperfect. Differences may be missed, misclassified, or shown because of rendering, fonts,
    scans, layout, or document structure. Treat the output as a review aid and check the source documents before
    you rely on a result.
  </p>`,
  `<p>
    The site offers no legal, engineering, financial, compliance, or other professional advice, and using it
    creates no professional relationship. Do not use its output as the sole basis for a safety-critical, legal,
    regulatory, or financial decision. Disputes about a document stay with the people who have it.
  </p>`,
)}
${section(
  "The site and software",
  `<p>
    The hosted site, branding, and original content belong to Akarsh Gopal or to licensors, and are protected by
    applicable intellectual-property laws. These terms give you a limited, revocable, non-exclusive right to use
    the hosted site for its intended purpose. Third-party and open-source components remain subject to their own
    licence terms.
  </p>`,
)}
${section(
  "No warranties",
  `<p>
    To the extent permitted by law, the service is provided “as is” and “as available.” There is no promise that
    it will be uninterrupted, error-free, secure, or suitable for a particular purpose, or that every document
    difference will be detected. Nothing in these terms limits warranties or consumer rights that cannot legally
    be excluded.
  </p>`,
)}
${section(
  "Limitation of liability",
  `<p>
    To the extent permitted by law, the operator is not liable for indirect, incidental, special, consequential,
    or punitive loss, or for lost profits, data, business, or opportunities arising from use of the service. The
    operator’s total liability relating to the service will not exceed €100, or the amount paid for it if that is
    higher. The hosted site is currently free.
  </p>`,
  `<p>
    These limits do not apply to liability that cannot legally be limited, including liability for intent, gross
    negligence, injury to life, body, or health, or mandatory consumer protections.
  </p>`,
)}
${section(
  "If your use causes a claim",
  `<p>
    If your use of pdfdiff causes a claim against the operator — for example because you compared documents you
    were not allowed to process, or you relied on a comparison in a dispute — you will cover that claim to the
    extent the law allows, including reasonable costs of responding to it.
  </p>`,
)}
${section(
  "Changes and ending use",
  `<p>
    You may stop using pdfdiff at any time. There are no accounts to cancel. Access may be restricted when
    reasonably necessary to protect the site, comply with law, or address misuse.
  </p>`,
  `<p>
    These terms may be updated. Material changes apply prospectively and will be identified by a new date at the
    top of this page. Continued use after an update means you accept the revised terms, to the extent permitted by
    law.
  </p>`,
)}
${section(
  "Applicable law and contact",
  `<p>
    These terms are governed by the laws of the operator’s place of residence, without giving effect to
    conflict-of-law rules. Mandatory protections and the courts available to consumers in their country of
    residence are unaffected.
  </p>`,
  `<p>
    Questions about these terms can be sent to ${mailto("akarsh@pdfdiff.app", "Terms%20question")}.
  </p>`,
)}`,
);

const BODIES = {
  home: HOME_BODY,
  privacy: PRIVACY_BODY,
  terms: TERMS_BODY,
};

function renderPage(baseHtml, route, origin) {
  const meta = ROUTE_META[route];
  const canonicalUrl = `${origin}${meta.path}`;
  const withMeta = applyRouteMeta(baseHtml, {
    title: meta.title,
    description: meta.description,
    canonicalUrl,
    keepJsonLd: route === "home",
  });
  return replaceRootInner(withMeta, BODIES[route]);
}

function writePage(relativePath, html) {
  const file = join(distDir, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  return relativePath;
}

function main() {
  const indexPath = join(distDir, "index.html");
  if (!existsSync(indexPath)) {
    console.error("prerender-seo: dist/index.html not found. Run vite build first.");
    process.exit(1);
  }

  const base = readFileSync(indexPath, "utf8");
  const origin = originFromCanonical(base);
  const written = [
    writePage("index.html", renderPage(base, "home", origin)),
    writePage("privacy/index.html", renderPage(base, "privacy", origin)),
    writePage("terms/index.html", renderPage(base, "terms", origin)),
  ];
  console.log(`prerender-seo: wrote ${written.map((file) => `dist/${file}`).join(", ")}`);
}

main();
