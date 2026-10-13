"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { homePublic } from "@/lib/home-public-content";
import { Reveal } from "@/components/motion/Reveal";
import { HomeWalletCta } from "@/components/wallet/HomeWalletCta";

export function HomeFooterCta() {
  const { lang } = useLanguage();
  const t = homePublic[lang].footerCta;

  return (
    <section className="border-t border-line bg-canvas-2">
      <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
        <Reveal>
          <h2 className="text-h2 font-bold tracking-tight text-ink">{t.title}</h2>
          <p className="mt-3 text-lead text-ink-2">{t.body}</p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <HomeWalletCta
              data-testid="home-footer-wallet-auth-cta"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-brand-ink transition-transform hover:scale-[1.02] active:scale-[0.98]"
            />
            <Link
              href="/create/token"
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-6 py-3 text-sm font-medium text-ink-2"
            >
              {t.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
