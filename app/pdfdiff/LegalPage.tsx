import { ThemeToggle } from "../../components/ui/theme-toggle";
import { AppFooter } from "./AppFooter";

type LegalPageKind = "privacy" | "terms";

const updatedAt = "August 31, 2026";

function LegalHeader() {
  return (
    <header className="flex min-h-[72px] items-center justify-between gap-5 border-b border-border bg-card px-8 max-[820px]:px-[18px]">
      <a className="inline-flex items-center gap-2.5 whitespace-nowrap text-base font-[720] tracking-[-0.04em] text-foreground no-underline" href="/" aria-label="pdfdiff home">
        <span className="grid size-[26px] place-items-center rounded-lg bg-primary text-[15px] font-extrabold tracking-[-0.08em] text-primary-foreground" aria-hidden="true">◐</span>
        pdfdiff
      </a>
      <ThemeToggle />
    </header>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-8 first:border-0 first:pt-0">
      <h2 className="m-0 text-xl font-[720] tracking-[-0.035em]">{title}</h2>
      <div className="mt-3 grid gap-3 text-[15px] leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <p className="rounded-xl border border-success/30 bg-success/5 px-5 py-4 text-[15px] leading-7 text-foreground"><strong>Short version:</strong> your PDFs are processed locally in your browser and never uploaded. If you explicitly choose to remember a comparison, local copies are saved only on your device.</p>

      <LegalSection title="Who is responsible">
        <p>pdfdiff is the operator responsible for the website described in this policy. For privacy questions or requests, email <a className="text-primary underline underline-offset-4" href="mailto:feedback@pdfdiff.app?subject=Privacy%20request">feedback@pdfdiff.app</a>.</p>
      </LegalSection>

      <LegalSection title="PDF processing">
        <p>When you select PDFs, the files are opened, rendered, and compared by code running on your device. Their contents are not sent to pdfdiff or its hosting provider. Unless you opt in to remembering them, the active comparison remains only in browser memory while you use the page and is released when you start over or close the page.</p>
        <p>You are responsible for making sure you are permitted to process the documents you select, particularly documents containing confidential or personal information.</p>
      </LegalSection>

      <LegalSection title="Information stored on your device">
        <p>pdfdiff uses browser storage for two functional purposes:</p>
        <ul className="m-0 grid gap-2 pl-5">
          <li><strong className="text-foreground">Saved comparisons:</strong> if you select “Remember these PDFs on this device,” IndexedDB stores local copies of both PDFs together with their filenames, sizes, settings, and save date. Up to six comparisons are kept. You can withdraw your choice and delete every copy with “Clear history” or your browser’s site-data controls.</li>
          <li><strong className="text-foreground">Theme:</strong> local storage remembers whether you selected light or dark mode. You can change the setting at any time or remove it through your browser.</li>
        </ul>
        <p>Saved comparisons are strictly opt in and the checkbox is off by default. pdfdiff does not use cookies, advertising identifiers, or tracking pixels.</p>
      </LegalSection>

      <LegalSection title="Website delivery and technical data">
        <p>The website is delivered through Cloudflare. Like any website host, Cloudflare receives technical request information such as your IP address, browser and device details, requested URL, and request time. This data may be processed to deliver the site, protect it from abuse, and maintain reliability. PDF contents are not included in these requests.</p>
        <p>pdfdiff does not include a product-analytics or advertising service. Cloudflare describes its processing and international transfer safeguards in its <a className="text-primary underline underline-offset-4" href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
      </LegalSection>

      <LegalSection title="Messages you send">
        <p>If you email us, we receive your email address and the information you include. We use it to respond, resolve issues, and maintain appropriate business records. Please do not attach confidential PDFs to a feedback message. Messages are kept only for as long as reasonably necessary for those purposes or to meet legal obligations.</p>
      </LegalSection>

      <LegalSection title="Legal bases and sharing">
        <p>Where the GDPR applies, technical data is processed as necessary to provide the service and for the legitimate interests of operating, securing, and improving it. Messages are processed to respond to your request and for those same legitimate interests. Information may also be processed where required by law.</p>
        <p>We do not sell personal information or share it for targeted advertising. Information is disclosed only to service providers needed to operate the website or email, when required by law, or to protect rights and security.</p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>Depending on where you live, you may have rights to access, correct, delete, restrict, or object to processing of your personal data, and to receive portable data. You may also complain to your local data-protection authority. Contact us to exercise a right.</p>
        <p>Data kept only in your browser is not accessible to us. You can manage it directly using “Clear history” or your browser’s site-data controls.</p>
      </LegalSection>

      <LegalSection title="Children and changes">
        <p>pdfdiff is not directed to children under 16, and we do not knowingly collect their personal information. We may update this policy when the service or applicable requirements change. The date above shows the latest revision.</p>
      </LegalSection>
    </>
  );
}

function TermsOfService() {
  return (
    <>
      <p className="text-[17px] leading-8 text-muted-foreground">These terms govern your use of pdfdiff. By using the service, you agree to them. If you do not agree, do not use the service.</p>

      <LegalSection title="The service">
        <p>pdfdiff is a browser-based tool for comparing two PDF revisions. It can highlight visual and textual differences, align pages, and export a summary. Processing happens on your device and the service does not receive your PDF contents.</p>
        <p>The service is provided without an account and currently without charge. We may improve, change, suspend, or discontinue any part of it.</p>
      </LegalSection>

      <LegalSection title="Your documents and responsibilities">
        <p>You keep all rights in the documents you select. Selecting a file does not grant pdfdiff rights to it because the file is not uploaded to the service.</p>
        <p>You may use pdfdiff only with documents you are legally permitted to access and process. You are responsible for protecting confidential information on your device and for reviewing the comparison before relying on it.</p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You must not misuse the service, attempt to disrupt or bypass its security, interfere with other users, use automated traffic that burdens the site, reverse engineer non-public parts of the hosted service except where law permits it, or use the service in violation of law or another person’s rights.</p>
      </LegalSection>

      <LegalSection title="Accuracy and professional review">
        <p>PDF comparison is inherently imperfect. Differences may be missed, misclassified, or shown because of rendering, fonts, scans, layout, or document structure. pdfdiff is a review aid, not a substitute for checking the source documents.</p>
        <p>The service does not provide legal, engineering, financial, compliance, or other professional advice. Do not use its output as the sole basis for a safety-critical, legal, regulatory, or financial decision.</p>
      </LegalSection>

      <LegalSection title="Our content and software">
        <p>The service, branding, interface, and original content are owned by pdfdiff or its licensors and are protected by applicable intellectual-property laws. These terms give you a limited, revocable, non-exclusive right to use the hosted service for its intended purpose. Third-party and open-source components remain subject to their own licence terms.</p>
      </LegalSection>

      <LegalSection title="No warranties">
        <p>To the extent permitted by law, the service is provided “as is” and “as available.” We do not promise that it will be uninterrupted, error-free, secure, or suitable for a particular purpose, or that every document difference will be detected. Nothing in these terms limits warranties or consumer rights that cannot legally be excluded.</p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>To the extent permitted by law, pdfdiff is not liable for indirect, incidental, special, consequential, or punitive loss, or for lost profits, data, business, or opportunities arising from use of the service. pdfdiff’s total liability relating to the free service will not exceed €100.</p>
        <p>These limits do not apply to liability that cannot legally be limited, including liability for intent, gross negligence, injury to life, body, or health, or mandatory consumer protections.</p>
      </LegalSection>

      <LegalSection title="Changes and ending use">
        <p>You may stop using pdfdiff at any time. Because there are no accounts, there is no account to cancel. We may restrict access when reasonably necessary to protect the service, comply with law, or address misuse.</p>
        <p>We may update these terms. Material changes apply prospectively and will be identified by a new date at the top of this page. Continued use after an update means you accept the revised terms, to the extent permitted by law.</p>
      </LegalSection>

      <LegalSection title="Applicable law and contact">
        <p>Applicable law governs these terms. Mandatory protections and the courts available to consumers in their country of residence are not affected.</p>
        <p>Questions about these terms can be sent to <a className="text-primary underline underline-offset-4" href="mailto:feedback@pdfdiff.app?subject=Terms%20question">feedback@pdfdiff.app</a>.</p>
      </LegalSection>
    </>
  );
}

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  const isPrivacy = kind === "privacy";
  return (
    <main className="min-h-screen bg-background font-sans tracking-[-0.01em] text-foreground">
      <div className="flex min-h-screen flex-col">
        <LegalHeader />
        <article className="mx-auto w-full max-w-[800px] flex-1 px-8 pb-20 pt-[clamp(48px,7vw,82px)] max-[820px]:px-[18px]">
          <a className="text-sm font-semibold text-muted-foreground no-underline hover:text-foreground" href="/">← Back to pdfdiff</a>
          <header className="mt-8 border-b border-border pb-10">
            <p className="m-0 text-[11px] font-[760] uppercase tracking-[0.17em] text-primary">Legal</p>
            <h1 className="mt-3 text-[clamp(38px,6vw,62px)] font-[730] leading-none tracking-[-0.065em]">{isPrivacy ? "Privacy Policy" : "Terms of Service"}</h1>
            <p className="mt-4 text-sm text-muted-foreground">Last updated {updatedAt}</p>
          </header>
          <div className="mt-10 grid gap-9">{isPrivacy ? <PrivacyPolicy /> : <TermsOfService />}</div>
        </article>
        <AppFooter />
      </div>
    </main>
  );
}
