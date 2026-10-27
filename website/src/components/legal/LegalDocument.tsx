"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { legalCopy, type LegalPageContent } from "@/lib/legal-content";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal-contact";

function renderParagraph(text: string, email: string) {
  const parts = text.split("{email}");
  if (parts.length === 1) return text;
  return (
    <>
      {parts[0]}
      <a href={`mailto:${email}`} className="text-brand underline underline-offset-2">
        {email}
      </a>
      {parts.slice(1).join("{email}")}
    </>
  );
}

export function LegalDocument({ kind }: { kind: "privacy" | "terms" }) {
  const { lang, setLang } = useLanguage();
  const doc: LegalPageContent = legalCopy[lang][kind];
  const email = LEGAL_CONTACT_EMAIL;
  const englishPath = kind === "privacy" ? "/privacy" : "/terms";

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-14 sm:px-8 md:pt-20">
      {lang !== "en" && doc.englishPrevails ? (
        // The site has no locale-prefixed routes: language is a stored preference, so the
        // English version of this page is the same path with the preference switched to en.
        <p
          className="mb-8 rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink-2"
          role="note"
          data-testid="english-prevails"
        >
          {doc.englishPrevails}{" "}
          {doc.englishLink ? (
            <Link
              href={englishPath}
              hrefLang="en"
              onClick={() => setLang("en")}
              className="font-medium text-brand underline underline-offset-2"
              data-testid="english-version-link"
            >
              {doc.englishLink}
            </Link>
          ) : null}
        </p>
      ) : null}
      <header className="border-b border-line pb-10">
        <p className="font-mono text-xs uppercase tracking-widest text-brand">PEOPLE</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{doc.title}</h1>
        {doc.subtitle ? (
          <p className="mt-4 text-lg leading-relaxed text-ink-2">{doc.subtitle}</p>
        ) : null}
        <p className="mt-6 font-mono text-xs text-ink-3">
          {doc.effectiveLabel}: {doc.effectiveDate}
        </p>
      </header>

      <div className="prose-legal mt-10 space-y-10">
        {doc.blocks.map((block) => (
          <section key={block.title}>
            <h2 className="text-xl font-semibold tracking-tight text-ink">{block.title}</h2>
            <div className="mt-3 space-y-3 text-base leading-relaxed text-ink-2">
              {block.body.map((paragraph) => (
                <p key={paragraph.slice(0, 48)}>{renderParagraph(paragraph, email)}</p>
              ))}
            </div>
          </section>
        ))}

        <section>
          <h2 className="text-xl font-semibold tracking-tight text-ink">{doc.contactTitle}</h2>
          <p className="mt-3 text-base leading-relaxed text-ink-2">
            {renderParagraph(doc.contactBody, email)}
          </p>
        </section>
      </div>

      <p className="mt-12 border-t border-line pt-8 text-sm text-ink-3">
        <Link href="/" className="text-brand hover:underline">
          {doc.backHome}
        </Link>
        {" · "}
        <Link href={kind === "privacy" ? "/terms" : "/privacy"} className="text-brand hover:underline">
          {kind === "privacy" ? doc.relatedTerms : doc.relatedPrivacy}
        </Link>
      </p>
    </div>
  );
}
