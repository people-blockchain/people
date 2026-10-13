"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { homePublic } from "@/lib/home-public-content";
import { HubSection } from "@/components/hub/HubSection";
import { CommunityShareFlow } from "@/components/visuals/CommunityShareFlow";
import { ContractBuildLoop } from "@/components/visuals/ContractBuildLoop";

export function HomeBlocks() {
  const { lang } = useLanguage();
  const blocks = homePublic[lang].blocks;
  const visuals = homePublic[lang].visuals;

  return (
    <>
      {blocks.map((block, index) => (
        <HubSection
          key={block.id}
          id={`home-${block.id}`}
          eyebrow={String(index + 1).padStart(2, "0")}
          title={block.title}
          lead={block.body}
          canvas={index % 2 === 0 ? "canvas" : "canvas-2"}
        >
          {block.id === "community" ? <CommunityShareFlow copy={visuals} /> : null}
          {block.id === "contracts" ? <ContractBuildLoop copy={visuals} /> : null}
          {"ctaLabel" in block && block.ctaLabel && block.ctaHref ? (
            <Link
              href={block.ctaHref}
              className="mt-6 inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
            >
              {block.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </HubSection>
      ))}
    </>
  );
}
