"use client";

import { useEffect, useState } from "react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import type { SaleStats } from "@/lib/sale/adapter";
import { CURVE } from "@/lib/sale/config";
import { fillCopy, pricePerPpl } from "@/lib/sale/format";
import type { SalePhase } from "@/lib/sale/sale-state";

/**
 * Mobile-only CTA that appears once the hero form has scrolled away and jumps
 * back to the bottom form. Hidden from `sm` up, where the form is always in
 * reach.
 */
export function StickyBuyBar({ stats, targetId, phase = "closed" }: { stats: SaleStats; targetId: string; phase?: SalePhase }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const price = stats.spotPriceUsd ?? CURVE.startPriceUsd;
  if (phase !== "open") return null;
  const priceText = fillCopy(t.sticky.price, { price: pricePerPpl(price, lang) });

  return (
    <div
      data-testid="sticky-buy-bar"
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-300 sm:hidden ${
        visible ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
    >
      <a
        href={`#${targetId}`}
        aria-label={`${t.sticky.label} ${priceText}`}
        tabIndex={visible ? undefined : -1}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-base font-semibold text-brand-ink shadow-[0_12px_30px_-14px_rgba(3,105,161,0.8)]"
      >
        {t.sticky.label}{" "}
        <span className="text-sm font-medium opacity-80">{priceText}</span>
      </a>
    </div>
  );
}
