"use client";

import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { Chip, Eyebrow, SectionIntro } from "./ui/primitives";

export function WhySection() {
  const { lang } = useLanguage();
  const t = content[lang].why;

  const [lead, ...rest] = t.pillars;

  return (
    <section id="concept" className="anchor-offset relative border-b border-line bg-canvas-2 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionIntro eyebrow={t.tag} title={t.title} lead={t.subtitle} className="max-w-3xl" />
        </Reveal>

        <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Editorial statement — the one idea that matters most */}
          <Reveal className="lg:col-span-5">
            <div className="relative">
              <span className="mono-label block text-ink-3">01</span>
              <Eyebrow tone="brand" className="mt-3">
                {lead.tag}
              </Eyebrow>
              <h3 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-ink text-balance sm:text-3xl">
                {lead.title}
              </h3>
              <p className="mt-4 text-base leading-relaxed text-ink-2 text-pretty">{lead.desc}</p>
              <div className="mt-6 h-px w-full bg-gradient-to-r from-brand/60 via-line to-transparent" />
            </div>
          </Reveal>

          {/* Supporting pillars as scannable rows, not boxes */}
          <ul className="lg:col-span-7">
            {rest.map((pillar, index) => (
              <li key={pillar.title}>
                <Reveal delay={index * 60}>
                  <div className="group flex flex-col gap-2 border-t border-line py-5 sm:flex-row sm:items-baseline sm:gap-6">
                    <span className="mono-label shrink-0 pt-1 text-ink-3 transition-colors group-hover:text-brand sm:w-10">
                      {String(index + 2).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h4 className="text-base font-bold text-ink">{pillar.title}</h4>
                        <Chip tone="neutral">{pillar.tag}</Chip>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{pillar.desc}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
