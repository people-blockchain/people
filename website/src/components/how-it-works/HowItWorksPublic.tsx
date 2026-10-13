"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { WalletGateLink } from "@/components/wallet/WalletGateLink";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { hiwPublic } from "@/lib/hiw-public-content";
import { homePublic } from "@/lib/home-public-content";
import { Eyebrow } from "@/components/ui/primitives";
import { MODEL_A_FEE_SPLIT } from "@/lib/selling-economics";
import { FeeSplitDonut } from "@/components/visuals/FeeSplitDonut";
import { CommunityShareFlow } from "@/components/visuals/CommunityShareFlow";
import { HiwScrollSection } from "./HiwScrollSection";

export function HowItWorksPublic() {
  const { lang } = useLanguage();
  const t = hiwPublic[lang];
  const homeVisuals = homePublic[lang].visuals;
  const live = t.blocks.find((b) => b.id === "live");
  const participation = t.blocks.find((b) => b.id === "participation");
  const pplSupply = t.blocks.find((b) => b.id === "ppl-supply");
  const rewards = t.blocks.find((b) => b.id === "rewards");
  const anti = t.blocks.find((b) => b.id === "anti-bot");
  const honest = t.blocks.find((b) => b.id === "honest");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <Eyebrow tone="brand">People&apos;s Blockchain</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.title}</h1>
      <p className="mt-4 text-lg font-medium leading-relaxed text-ink-2">{t.loopLine}</p>

      {live ? (
        <section className="mt-12" id="live-now">
          <h2 className="text-h3 font-bold text-ink">{live.title}</h2>
          <ul className="mt-4 space-y-4">
            {live.items?.map((item) => (
              <li key={item.title} className="surface-elevated rounded-2xl border border-line p-4">
                <p className="font-semibold text-ink">{item.title}</p>
                {item.text ? <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.text}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {participation?.items?.length ? (
        <HiwScrollSection className="mt-12 anchor-offset" id="participation">
          <h2 className="text-h3 font-bold text-ink">{participation.title}</h2>
          <ul className="mt-4 space-y-4 hiw-stagger-list">
            {participation.items.map((item, index) => (
              <li
                key={item.title}
                className="surface-elevated rounded-2xl border border-line p-4 hiw-stagger-item"
                style={{ "--hiw-i": index } as CSSProperties}
              >
                <p className="font-semibold text-ink">{item.title}</p>
                {item.text ? <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.text}</p> : null}
              </li>
            ))}
          </ul>
        </HiwScrollSection>
      ) : null}

      {pplSupply && "bullets" in pplSupply ? (
        <HiwScrollSection className="mt-12 anchor-offset" id="ppl-supply">
          <h2 className="text-h3 font-bold text-ink">{pplSupply.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{pplSupply.intro}</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-2">
            {pplSupply.bullets?.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </HiwScrollSection>
      ) : null}

      {rewards && "intro" in rewards ? (
        <HiwScrollSection className="mt-12 anchor-offset" id="rewards">
          <h2 className="text-h3 font-bold text-ink">{rewards.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{rewards.intro}</p>
          <FeeSplitDonut
            title={t.feeChartLabel}
            slices={MODEL_A_FEE_SPLIT.map((row, index) => ({
              id: row.id,
              pct: row.pct,
              label: rewards.feeSplit?.[index]?.label ?? row.id,
            }))}
          />
          <p className="mt-4 text-sm leading-relaxed text-ink-2">{rewards.communityPoolExample}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{rewards.tokenPoolNote}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{rewards.buybackNote}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{rewards.launchFeeNote}</p>
          <CommunityShareFlow copy={homeVisuals} />
        </HiwScrollSection>
      ) : null}

      {anti && "body" in anti ? (
        <section className="mt-12" id="anti-farming">
          <h2 className="text-h3 font-bold text-ink">{anti.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{anti.body}</p>
          <Link href="/docs#basics" className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline">
            {t.docsLinkLabel}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </section>
      ) : null}

      {honest && "bullets" in honest ? (
        <section className="mt-12" id="honest">
          <h2 className="text-h3 font-bold text-ink">{honest.title}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-2">
            {honest.bullets?.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-12 flex flex-wrap gap-3 border-t border-line pt-8">
        <WalletGateLink
          asButton
          connectLabel={t.ctaWallet}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink"
        >
          <span className="inline-flex items-center gap-2">
            {t.ctaWallet}
            <ArrowRight className="h-4 w-4" />
          </span>
        </WalletGateLink>
        <Link
          href="/create/token"
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink"
        >
          {t.ctaCreate}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
