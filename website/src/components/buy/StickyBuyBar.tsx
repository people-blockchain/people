"use client";

import { useEffect, useState } from "react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import type { SaleStats } from "@/lib/sale/adapter";
import { CURVE, saleContractConfigured } from "@/lib/sale/config";
import { fillCopy, pricePerPpl } from "@/lib/sale/format";

/**
 * Mobile-only CTA that appears once the hero form has scrolled away and jumps
 * back to the buy form. Hidden while `#buy-form` is in view.
 */
export function StickyBuyBar({ stats, targetId }: { stats: SaleStats; targetId: string }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const [visible, setVisible] = useState(false);
  const saleOpen = saleContractConfigured();

  useEffect(() => {
    const form = document.getElementById("buy-form");
    if (!form) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting && entry.intersectionRatio < 0.05);
      },
      { threshold: [0, 0.05, 0.1] },
    );
    observer.observe(form);
    return () => observer.disconnect();
  }, []);

  const price = stats.spotPriceUsd ?? CURVE.startPriceUsd;

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
        tabIndex={visible ? undefined : -1}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-base font-semibold text-brand-ink shadow-[0_12px_30px_-14px_rgba(3,105,161,0.8)]"
      >
        {saleOpen ? t.sticky.label : t.sticky.closedLabel}
        {saleOpen ? (
          <span className="text-sm font-medium opacity-80">
            {fillCopy(t.sticky.price, { price: pricePerPpl(price, lang) })}
          </span>
        ) : null}
      </a>
    </div>
  );
}
