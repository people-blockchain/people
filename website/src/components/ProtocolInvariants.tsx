"use client";

import { Binary, FileText, Scale, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { SectionIntro } from "./ui/primitives";

/** Compact public pointer — no internal spec filenames. */
const OFFICIAL_SPECS = [
  {
    name: "Network fee split",
  },
];

const GLYPHS = [Binary, Scale, ShieldCheck];

export function ProtocolInvariants({ embedded = false }: { embedded?: boolean }) {
  const { lang } = useLanguage();
  const t = content[lang].invariants;

  const invariants = [
    { title: t.inv1Title, desc: t.inv1Desc, formula: t.inv1Formula },
    { title: t.inv2Title, desc: t.inv2Desc, formula: t.inv2Formula },
    { title: t.inv3Title, desc: t.inv3Desc, formula: t.inv3Formula },
  ];

  const inner = (
    <>
      <dl className={`grid gap-x-10 gap-y-10 md:grid-cols-3 ${embedded ? "" : "mt-12"}`}>
        {invariants.map((invariant, index) => {
          const Glyph = GLYPHS[index];
          return (
            <Reveal key={invariant.title} delay={index * 80}>
              <div className="border-t border-line pt-6">
                <div className="flex items-center gap-2.5">
                  <Glyph className="h-4 w-4 text-value" aria-hidden="true" />
                  <dt className="text-sm font-bold uppercase tracking-wide text-ink">
                    {invariant.title}
                  </dt>
                </div>
                <dd className="mt-4">
                  <code className="block break-words font-mono text-base font-semibold text-value sm:text-lg">
                    {invariant.formula}
                  </code>
                  <p className="mt-4 text-sm leading-relaxed text-ink-2">{invariant.desc}</p>
                </dd>
              </div>
            </Reveal>
          );
        })}
      </dl>

      <Reveal delay={100}>
        <div className="mt-10 border-t border-line pt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="mono-label inline-flex items-center gap-2 text-ink-2">
              <FileText className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              {t.specsHeader}
            </span>
            <span className="mono-label text-ink-3">{t.specsSub}</span>
          </div>
          <ul className="mt-6 grid gap-x-10 md:grid-cols-2">
            {OFFICIAL_SPECS.map((file) => (
              <li key={file.name} className="border-t border-line py-3.5">
                <span className="font-mono text-[12.5px] font-semibold text-brand">{file.name}</span>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">
                  {t.specDesc}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </>
  );

  if (embedded) {
    return <div>{inner}</div>;
  }

  return (
    <section id="invariants" className="anchor-offset relative border-b border-line bg-canvas py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionIntro eyebrow={t.tag} title={t.title} lead={t.subtitle} tone="value" className="max-w-3xl" />
        </Reveal>
        {inner}
      </div>
    </section>
  );
}
