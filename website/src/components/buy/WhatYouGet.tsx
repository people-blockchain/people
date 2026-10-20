"use client";

import { Coins, Lock, RefreshCw, Send } from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import { PAYOUT_DEFAULT, SALE } from "@/lib/sale/config";
import { curveEnd } from "@/lib/sale/curve";
import { fillCopy, usdCompact } from "@/lib/sale/format";

import { FootnoteRef } from "./SmallPrint";

const ICONS = [Coins, RefreshCw, Send, Lock] as const;

/** The "sell back to the curve" item — the one that carries the price-risk note. */
const SELL_BACK_ITEM_INDEX = 1;

/** The four things a purchase actually gets you. Every number comes from config. */
export function WhatYouGet() {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const end = curveEnd();

  const vars = {
    fee: `${SALE.sellFeePct}%`,
    payoutStable: PAYOUT_DEFAULT.stable,
    payoutNetwork: PAYOUT_DEFAULT.networkLabel,
    verified: SALE.fullMainnetVerifiedPeople.toLocaleString(lang),
    months: SALE.fullMainnetMaxMonths,
    endRaise: usdCompact(end.raisedUsd, lang),
    liquidityShare: `${SALE.liquiditySharePct}%`,
    multisigShare: `${SALE.multisigSharePct}%`,
    lock: SALE.lpLockMonths,
  };

  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-2" data-testid="what-you-get">
      {t.whatYouGet.items.map((item, index) => {
        const Icon = ICONS[index] ?? Coins;
        return (
          <li
            key={item.title}
            className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-3 text-base font-bold text-ink">{fillCopy(item.title, vars)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              {fillCopy(item.body, vars)}
              {index === SELL_BACK_ITEM_INDEX ? <FootnoteRef marker="*" /> : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
