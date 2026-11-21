"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { pplSaleCountdown, resolvePplSaleOpenDate } from "@/lib/bounty-countdown";
import type { HomeWarmCopy } from "@/lib/home-warm-content";

type CountdownCopy = HomeWarmCopy["hero"]["countdown"];

export function HomeHeroCountdown({ badge, countdown }: { badge: string; countdown: CountdownCopy }) {
  const { lang } = useLanguage();
  const target = useMemo(() => resolvePplSaleOpenDate(), []);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const parts = target && now !== null ? pplSaleCountdown(target, now) : null;

  const cells = parts
    ? [
        { label: countdown.days, value: parts.days },
        { label: countdown.hours, value: parts.hours },
        { label: countdown.minutes, value: parts.minutes },
        { label: countdown.seconds, value: parts.seconds },
      ]
    : [];

  return (
    <div className="mt-4 space-y-3" data-testid="home-hero-beta-countdown">
      <p
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-semibold tracking-wide text-ink-2 shadow-[var(--elev-1)] sm:text-xs"
        data-testid="home-hero-beta-badge"
      >
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-value opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-value" />
        </span>
        <span className="text-pretty">{badge}</span>
      </p>

      {target && parts && !parts.open ? (
        <div className="grid max-w-md grid-cols-4 gap-1.5 sm:gap-2" aria-live="off">
          {cells.map((cell) => (
            <div
              key={cell.label}
              className="rounded-xl border border-line bg-surface/80 px-2 py-2 text-center sm:px-2.5 sm:py-2.5"
            >
              <p className="font-mono text-lg font-bold tabular-nums text-ink sm:text-xl">
                {now === null ? "—" : String(cell.value).padStart(2, "0")}
              </p>
              <p className="mt-0.5 text-[10px] font-medium text-ink-3 sm:text-[11px]">{cell.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      {parts?.open ? (
        <p className="text-sm font-semibold text-value" data-testid="home-hero-beta-open">
          {countdown.open}
        </p>
      ) : null}

      {target && now !== null && parts && !parts.open ? (
        <p className="text-xs text-ink-3">
          {countdown.dateLabel}:{" "}
          <span className="font-semibold text-ink-2">
            {new Intl.DateTimeFormat(lang, {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }).format(target)}{" "}
            UTC
          </span>
        </p>
      ) : null}
    </div>
  );
}