"use client";

import { Check, Coins, Smartphone, Users, ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { SectionIntro } from "./ui/primitives";

const roleStyles = {
  value: {
    bar: "from-value/80 to-value/0",
    glyph: "text-value",
    glyphBg: "bg-value/10 border-value/30",
    check: "text-value",
    cta: "border-value/35 bg-value/10 text-value hover:bg-value/20",
  },
  brand: {
    bar: "from-brand/80 to-brand/0",
    glyph: "text-brand",
    glyphBg: "bg-brand/10 border-brand/30",
    check: "text-brand",
    cta: "border-brand/35 bg-brand/10 text-brand hover:bg-brand/20",
  },
  warm: {
    bar: "from-warm/80 to-warm/0",
    glyph: "text-warm",
    glyphBg: "bg-warm/10 border-warm/30",
    check: "text-warm",
    cta: "border-warm/35 bg-warm/10 text-warm hover:bg-warm/20",
  },
} as const;

type RoleKey = keyof typeof roleStyles;

const glyphs = [Coins, Users, Smartphone];

export function AudiencesSection() {
  const { lang } = useLanguage();
  const t = content[lang].audiences;

  return (
    <section id="audiences" className="anchor-offset relative border-b border-line bg-canvas py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionIntro
            eyebrow={t.tag}
            title={t.title}
            lead={t.subtitle}
            tone="value"
            className="max-w-3xl"
          />
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {t.cards.map((card, index) => {
            const role = (card.color === "emerald" ? "value" : card.color === "amber" ? "warm" : "brand") as RoleKey;
            const style = roleStyles[role];
            const Glyph = glyphs[index];

            return (
              <Reveal key={card.role} delay={index * 90}>
                <article className="surface-elevated group relative flex h-full flex-col overflow-hidden rounded-3xl">
                  <span
                    className={`h-1 w-full bg-gradient-to-r ${style.bar}`}
                    aria-hidden="true"
                  />
                  <div className="flex flex-1 flex-col p-6 sm:p-7">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${style.glyphBg}`}
                        aria-hidden="true"
                      >
                        <Glyph className={`h-5 w-5 ${style.glyph}`} />
                      </span>
                      <span className="mono-label text-ink-3">{card.role}</span>
                    </div>

                    {/* Reserve two lines so a wrap in one locale/viewport does
                        not push that card's body copy out of alignment with
                        its neighbours. */}
                    <h3 className="mt-5 text-xl font-bold leading-snug tracking-tight text-ink text-balance lg:min-h-[3.5rem]">
                      {card.headline}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-ink-2">{card.desc}</p>

                    <ul className="mt-5 mb-6 space-y-3 border-t border-line pt-5">
                      {card.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5 text-sm text-ink-2">
                          <Check className={`mt-0.5 h-4 w-4 shrink-0 ${style.check}`} aria-hidden="true" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <a
                      href={card.anchor}
                      className={`mt-auto inline-flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${style.cta}`}
                    >
                      {card.cta}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </a>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
