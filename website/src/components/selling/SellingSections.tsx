"use client";

import Link from "next/link";
import { WalletGateLink } from "@/components/wallet/WalletGateLink";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { hub } from "@/lib/hub-content";
import {
  GROWTH_PAID_LINES,
  MODEL_A_FEE_SPLIT,
  TOKEN_COMMUNITY_SHARE_PCT,
} from "@/lib/selling-economics";
import { Chip } from "@/components/ui/primitives";
import { HubSection } from "@/components/hub/HubSection";

const barTone: Record<string, string> = {
  brand: "bg-brand",
  value: "bg-value",
  violet: "bg-violet",
  warm: "bg-warm",
  neutral: "bg-ink-3",
};

const cardRing: Record<string, string> = {
  allocation: "border-violet/40",
  fees: "border-value/40",
  partner: "border-warm/40",
};

export function CommunityValue() {
  const { lang } = useLanguage();
  const t = hub[lang].value;
  const economics = hub[lang].economics;

  return (
    <HubSection
      id={t.id}
      extraIds={["value"]}
      eyebrow={t.tag}
      title={t.title}
      lead={t.subtitle}
      tone="value"
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {t.cards.map((card) => (
          <article
            key={card.id}
            className={`surface-elevated flex h-full flex-col rounded-2xl p-4 ${cardRing[card.id] ?? ""}`}
          >
            <Chip
              tone={card.id === "allocation" ? "violet" : card.id === "fees" ? "value" : "warm"}
            >
              {card.kicker}
            </Chip>
            {card.id === "allocation" && (
              <p className="mt-3 font-mono text-3xl font-black text-violet">
                {TOKEN_COMMUNITY_SHARE_PCT}%
              </p>
            )}
            <h3 className="mt-3 text-base font-bold leading-snug text-ink">{card.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2">{card.body}</p>
            {card.id === "fees" && (
              <ol className="mt-4 space-y-1.5" aria-label={economics.title}>
                {MODEL_A_FEE_SPLIT.map((row, index) => (
                  <li key={row.id} className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${barTone[row.tone]}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 text-[12px] text-ink-2">
                      {economics.splits[index]?.label}
                    </span>
                    <span className="font-mono text-[12px] tabular-nums text-ink">
                      {row.pct}%
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {card.id === "partner" && (
              <p className="mt-3 font-mono text-xs uppercase tracking-wide text-warm">
                {GROWTH_PAID_LINES.map((line) => `${line.id} ${line.pct}%`).join(" · ")}
                {" · Growth budget"}
              </p>
            )}
            <a
              href={card.href}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
            >
              {card.cta}
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </article>
        ))}
      </div>
    </HubSection>
  );
}

export function JoinSection() {
  const { lang } = useLanguage();
  const t = hub[lang].join;

  return (
    <HubSection id={t.id} extraIds={["participate"]} eyebrow={t.tag} title={t.title} lead={t.subtitle}>
      <ol className="grid gap-3 sm:grid-cols-2">
        {t.steps.map((step) => (
          <li key={step.num} className="surface-elevated rounded-2xl p-4">
            <span className="mono-label text-brand">{step.num}</span>
            <h3 className="mt-2 text-sm font-bold text-ink">{step.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{step.body}</p>
            {step.href && step.cta ? (
              <Link href={step.href} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                {step.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <WalletGateLink
          asButton
          connectLabel={t.ctaJoin}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink"
        >
          <span className="inline-flex items-center gap-2">
            {t.ctaJoin}
            <ArrowRight className="h-4 w-4" />
          </span>
        </WalletGateLink>
        <Link
          href="/how-it-works"
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 py-3 text-sm font-medium text-ink-2"
        >
          {t.ctaHow}
        </Link>
      </div>
    </HubSection>
  );
}
