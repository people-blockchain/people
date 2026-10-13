"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { ArrowRight, Home } from "lucide-react";
import { Reveal } from "./motion/Reveal";
import { Chip } from "./ui/primitives";

export function HowItWorksBottomCta() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.bottomCta;

  return (
    <section className="border-t border-line bg-canvas-2 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="grid gap-8 rounded-3xl border border-line bg-surface p-6 sm:p-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <Chip tone="brand">
                {t.badge}
              </Chip>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink text-balance sm:text-3xl">
                {t.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2 sm:text-base">
                {t.desc}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-5 lg:justify-end">
              <Link
                href="/#join"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-value px-6 py-3.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {t.primaryCta}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-5 py-3.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
              >
                <Home className="h-4 w-4" />
                {t.secondaryCta}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
