"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { hub } from "@/lib/hub-content";
import { Reveal } from "./motion/Reveal";
import { Chip } from "./ui/primitives";
import { WalletGateLink } from "@/components/wallet/WalletGateLink";

export function ClosingCta() {
  const { lang } = useLanguage();
  const t = content[lang].closingCta;

  return (
    <section className="relative overflow-hidden border-b border-line bg-canvas-2 py-10 lg:py-14">
      {/* The glow is wider than a phone viewport (560px). `overflow-hidden` keeps
          the decorative halo from widening the document, which is what made the
          whole page scroll horizontally on mobile. */}
      <div className="glow-violet pointer-events-none absolute left-1/2 top-0 h-72 w-[560px] -translate-x-1/2 rounded-full" aria-hidden="true" />
      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <Chip tone="violet">{t.tag}</Chip>
          {/* `text-pretty` + a tighter measure avoids the ragged single-short-line
              break that `text-balance` produced at desktop widths. */}
          <h2 className="mx-auto mt-5 max-w-[34rem] text-h2 font-bold tracking-tight text-ink text-pretty">{t.title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lead text-ink-2 text-pretty">{t.body}</p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <WalletGateLink
              asButton
              connectLabel={t.primary}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-semibold text-brand-ink transition-transform hover:scale-[1.02] active:scale-[0.98] sm:w-auto"
            >
              <span className="inline-flex items-center gap-2">
                {t.primary}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </WalletGateLink>
            <Link
              href="/how-it-works"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-6 py-3.5 text-sm font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink sm:w-auto"
            >
              {t.secondary}
            </Link>
            <Link
              href="/create"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-surface px-6 py-3.5 text-sm font-semibold text-brand sm:w-auto"
            >
              {`${hub[lang].hero.ctaCreate} · ${hub[lang].tokenMarket.nftCta}`}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
