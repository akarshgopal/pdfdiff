import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";
import { styles } from "./styles";

type LegalPageKind = "privacy" | "terms";

const updatedAt = "September 5, 2026";

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.legalSection}>
      <h2 className={styles.legalSectionTitle}>{title}</h2>
      <div className={styles.legalProse}>{children}</div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <p className={styles.legalCallout}>
        <strong>Short version:</strong> your PDFs are processed locally in your browser and never uploaded. If you
        choose to remember a comparison, local copies stay on that device.
      </p>

      <LegalSection title="Who is responsible">
        <p>
          pdfdiff is operated by Akarsh Gopal. For privacy questions or requests, email{" "}
          <a className={styles.legalLink} href="mailto:feedback@pdfdiff.app?subject=Privacy%20request">
            feedback@pdfdiff.app
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="PDF processing">
        <p>
          When you select PDFs, the files are opened, rendered, and compared by code running on your device. Their
          contents stay there. Unless you opt in to remembering them, the active comparison remains only in browser
          memory while you use the page and is released when you start over or close the page.
        </p>
        <p>
          Files compared in the browser never reach the operator, so they cannot be accessed, corrected, deleted, or
          produced from here. You are responsible for making sure you are permitted to process the documents you select,
          particularly documents containing confidential or personal information.
        </p>
      </LegalSection>

      <LegalSection title="Information stored on your device">
        <p>pdfdiff uses browser storage for three functional purposes:</p>
        <ul className={styles.legalList}>
          <li>
            <strong className="text-foreground">Saved comparisons:</strong> if you select “Remember these PDFs in this
            browser,” IndexedDB stores local copies of both PDFs together with their filenames, sizes, settings, and
            save date. Up to six comparisons are kept. You can delete every copy with “Clear history” or your browser’s
            site-data controls.
          </li>
          <li>
            <strong className="text-foreground">Theme:</strong> local storage remembers whether you selected light or
            dark mode.
          </li>
          <li>
            <strong className="text-foreground">Overlay colours:</strong> local storage remembers the highlight colours
            you chose for added, removed, and unchanged regions.
          </li>
        </ul>
        <p>
          Saved comparisons are opt in and the checkbox is off by default. Theme and overlay choices stay on your
          device. pdfdiff has no advertising identifiers, tracking pixels, or analytics cookies. The host may set
          strictly necessary security cookies to deliver and protect the site.
        </p>
      </LegalSection>

      <LegalSection title="Website delivery and technical data">
        <p>
          The website is delivered through Cloudflare. Like any website host, Cloudflare receives technical request
          information such as your IP address, browser and device details, requested URL, and request time. This data
          may be processed to deliver the site, protect it from abuse, and maintain reliability. PDF contents are not
          included in these requests.
        </p>
        <p>
          The site has no product-analytics or advertising service, and personal information is not sold or shared for
          targeted advertising. Cloudflare describes its processing and international transfer safeguards in its{" "}
          <a
            className={styles.legalLink}
            href="https://www.cloudflare.com/privacypolicy/"
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Messages you send">
        <p>
          Email to the address above includes your email address and whatever you write. It is used to respond, resolve
          issues, and keep records reasonably needed for those purposes or for legal obligations. Leave confidential
          PDFs out of feedback messages.
        </p>
      </LegalSection>

      <LegalSection title="Legal bases and sharing">
        <p>
          Where the GDPR applies, technical data is processed as necessary to provide the service and for the legitimate
          interests of operating and securing the site. Messages are processed to respond to your request and for those
          same legitimate interests. Information may also be processed where required by law.
        </p>
        <p>
          Information is disclosed only to the providers needed to operate the website or email, when required by law,
          or to protect rights and security. A lawful request can be considered when it concerns information actually
          held here — for example an email you sent. Compared PDFs never become those records.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          Depending on where you live, you may have rights to access, correct, delete, restrict, or object to processing
          of your personal data, and to receive portable data. You may also complain to your local data-protection
          authority. Contact the address above to exercise a right in data held by the operator.
        </p>
        <p>Data kept only in your browser can be managed with “Clear history” or your browser’s site-data controls.</p>
      </LegalSection>

      <LegalSection title="Children and changes">
        <p>
          pdfdiff is intended for people 16 and older. The policy may be updated when the service or applicable
          requirements change. The date above shows the latest revision.
        </p>
      </LegalSection>
    </>
  );
}

function TermsOfService() {
  return (
    <>
      <p className={styles.legalLead}>
        These terms govern your use of pdfdiff. By using the site, you agree to them. If you do not agree, do not use
        the site.
      </p>

      <LegalSection title="The service">
        <p>
          pdfdiff is a browser-based tool for comparing two PDF revisions. It can highlight visual and textual
          differences, align pages, and export a summary. Processing happens on your device.
        </p>
        <p>
          The site is provided without an account and currently without charge. It may be improved, changed, suspended,
          or discontinued. Support and uptime are not promised.
        </p>
        <p>
          These terms apply to this website. Source code is offered separately under the MIT License; running your own
          copy is covered by that licence.
        </p>
      </LegalSection>

      <LegalSection title="Your documents">
        <p>
          You keep all rights in the documents you select. Selecting a file grants no rights in it to the operator,
          because the file stays on your device.
        </p>
        <p>
          Use pdfdiff only with documents you are legally permitted to access and process. You are responsible for
          protecting confidential information on your device, for the files you choose to open, and for reviewing the
          comparison before relying on it. Opening a PDF still runs a renderer on your device.
        </p>
      </LegalSection>

      <LegalSection title="Notices">
        <p>
          Compared PDFs are never hosted, stored, or transmitted to the site. There is nothing here to take down or
          produce, and no copy from which to decide who may use a document. Complaints about a file someone compared
          belong with the person who has that file.
        </p>
        <p>
          If the pdfdiff website or software itself is the issue, email{" "}
          <a className={styles.legalLink} href="mailto:feedback@pdfdiff.app?subject=Legal%20notice">
            feedback@pdfdiff.app
          </a>{" "}
          with enough detail to identify the material. Incomplete, automated, or bulk notices may go unanswered.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>
          Do not misuse the site, attempt to disrupt or bypass its security, interfere with other people using it, send
          automated traffic that burdens the host, or use the site in violation of law or another person’s rights.
        </p>
      </LegalSection>

      <LegalSection title="Accuracy and professional review">
        <p>
          PDF comparison is imperfect. Differences may be missed, misclassified, or shown because of rendering, fonts,
          scans, layout, or document structure. Treat the output as a review aid and check the source documents before
          you rely on a result.
        </p>
        <p>
          The site offers no legal, engineering, financial, compliance, or other professional advice, and using it
          creates no professional relationship. Do not use its output as the sole basis for a safety-critical, legal,
          regulatory, or financial decision. Disputes about a document stay with the people who have it.
        </p>
      </LegalSection>

      <LegalSection title="The site and software">
        <p>
          The hosted site, branding, and original content belong to Akarsh Gopal or to licensors, and are protected by
          applicable intellectual-property laws. These terms give you a limited, revocable, non-exclusive right to use
          the hosted site for its intended purpose. Third-party and open-source components remain subject to their own
          licence terms.
        </p>
      </LegalSection>

      <LegalSection title="No warranties">
        <p>
          To the extent permitted by law, the service is provided “as is” and “as available.” There is no promise that
          it will be uninterrupted, error-free, secure, or suitable for a particular purpose, or that every document
          difference will be detected. Nothing in these terms limits warranties or consumer rights that cannot legally
          be excluded.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the extent permitted by law, the operator is not liable for indirect, incidental, special, consequential,
          or punitive loss, or for lost profits, data, business, or opportunities arising from use of the service. The
          operator’s total liability relating to the service will not exceed €100, or the amount paid for it if that is
          higher. The hosted site is currently free.
        </p>
        <p>
          These limits do not apply to liability that cannot legally be limited, including liability for intent, gross
          negligence, injury to life, body, or health, or mandatory consumer protections.
        </p>
      </LegalSection>

      <LegalSection title="If your use causes a claim">
        <p>
          If your use of pdfdiff causes a claim against the operator — for example because you compared documents you
          were not allowed to process, or you relied on a comparison in a dispute — you will cover that claim to the
          extent the law allows, including reasonable costs of responding to it.
        </p>
      </LegalSection>

      <LegalSection title="Changes and ending use">
        <p>
          You may stop using pdfdiff at any time. There are no accounts to cancel. Access may be restricted when
          reasonably necessary to protect the site, comply with law, or address misuse.
        </p>
        <p>
          These terms may be updated. Material changes apply prospectively and will be identified by a new date at the
          top of this page. Continued use after an update means you accept the revised terms, to the extent permitted by
          law.
        </p>
      </LegalSection>

      <LegalSection title="Applicable law and contact">
        <p>
          These terms are governed by the laws of the operator’s place of residence, without giving effect to
          conflict-of-law rules. Mandatory protections and the courts available to consumers in their country of
          residence are unaffected.
        </p>
        <p>
          Questions about these terms can be sent to{" "}
          <a className={styles.legalLink} href="mailto:feedback@pdfdiff.app?subject=Terms%20question">
            feedback@pdfdiff.app
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  const isPrivacy = kind === "privacy";
  return (
    <main className={styles.root}>
      <div className={styles.shell}>
        <AppHeader href="/" />
        <article className={styles.legalArticle}>
          <a className={styles.legalBack} href="/">
            ← Back to pdfdiff
          </a>
          <header className={styles.legalHeader}>
            <p className={styles.eyebrow}>Legal</p>
            <h1 className={styles.legalTitle}>{isPrivacy ? "Privacy Policy" : "Terms of Service"}</h1>
            <p className={styles.legalUpdated}>Last updated {updatedAt}</p>
          </header>
          <div className={styles.legalBody}>{isPrivacy ? <PrivacyPolicy /> : <TermsOfService />}</div>
        </article>
        <AppFooter />
      </div>
    </main>
  );
}
