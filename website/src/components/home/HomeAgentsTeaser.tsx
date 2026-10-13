"use client";

import Link from "next/link";
import { ArrowRight, Bot } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { homePublic } from "@/lib/home-public-content";

export function HomeAgentsTeaser() {
  const { lang } = useLanguage();
  const teaser = homePublic[lang].agentsTeaser;
  if (!teaser) return null;

  return (
    <section className="border-y border-line bg-canvas-2" aria-labelledby="home-agents-title">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand">{teaser.eyebrow}</p>
            <h2 id="home-agents-title" className="mt-2 text-h2 font-bold tracking-tight text-ink">
              {teaser.title}
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-2">{teaser.lead}</p>
          </div>
          <Link
            href={teaser.ctaHref ?? "/agents"}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-opacity hover:opacity-90"
          >
            {teaser.cta}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {teaser.cards.map((card) => (
            <li
              key={card.title}
              className="surface-elevated flex flex-col rounded-2xl border border-line p-5"
            >
              <Bot className="h-5 w-5 text-brand" aria-hidden="true" />
              <p className="mt-3 font-semibold text-ink">{card.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{card.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
