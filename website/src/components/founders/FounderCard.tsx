"use client";

import { useState } from "react";
import { formatFounderDisplayNumber } from "@/lib/founders/format-founder-number";
import { countryFlagEmoji } from "@/lib/founders/countries";
import type { FoundersPromoCopy } from "@/lib/founders-promo-content";
import { PeopleWordmark } from "./founders-ui";

export type FounderCardData = {
  founderNumber: number;
  countryCode: string;
  countryName: string;
  entryMultiplier: number;
  totalPoints: number;
};

/**
 * Founder card with a flip to the back side. Without `founder` it is the promo
 * card: the number slot shows the localized "your number here" placeholder
 * instead of a bare "#—", and no number is invented for visitors.
 */
export function FounderCard({
  founder,
  t,
  lang,
}: {
  founder: FounderCardData | null;
  t: FoundersPromoCopy;
  lang: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const number = founder ? formatFounderDisplayNumber(founder.founderNumber, lang) : "—";

  return (
    <div className="founders-card-scene mx-auto w-full max-w-[360px]">
      <button
        type="button"
        onClick={() => setFlipped((v) => !v)}
        aria-pressed={flipped}
        aria-label={`${t.cardFounder} ${founder ? `#${number}` : t.cardNumberPlaceholder}. ${t.cardFlipHint}`}
        className="block w-full rounded-[28px] text-left focus-visible:outline-offset-4"
        data-testid="founders-card"
      >
        <div className={`founders-card-inner ${flipped ? "is-flipped" : ""}`}>
          <div className="founders-card-face relative grid overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0369a1_0%,#4f46e5_55%,#f59e0b_130%)] p-5 text-white shadow-[var(--elev-2)] sm:p-6">
            <div className="founders-card-sheen pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-16 -left-6 h-44 w-44 rounded-full bg-amber-300/20" aria-hidden="true" />
            <div className="relative flex flex-col justify-between">
              <div className="flex items-center justify-between gap-3">
                <PeopleWordmark tone="white" className="h-7" />
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">{t.cardNetwork}</span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">{t.cardFounder}</p>
                {founder ? (
                  <p className="mt-1 font-mono text-4xl font-bold leading-none tabular-nums sm:text-5xl" data-testid="founders-card-number">
                    #{number}
                  </p>
                ) : (
                  <p className="mt-1 max-w-[16ch] text-2xl font-bold leading-tight text-white sm:text-3xl" data-testid="founders-card-number">
                    {t.cardNumberPlaceholder}
                  </p>
                )}
              </div>
              <div className="flex items-end justify-between gap-3 text-xs text-white/85">
                <span>
                  {founder ? `${countryFlagEmoji(founder.countryCode)} ${founder.countryName}` : t.eyebrow}
                </span>
                <span className="opacity-80">{t.cardFlipHint}</span>
              </div>
            </div>
          </div>
          <div className="founders-card-face founders-card-back overflow-hidden rounded-[28px] border border-line bg-surface p-5 text-ink shadow-[var(--elev-2)] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.cardBackTitle}</p>
            {founder ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-ink-3">{t.cardCountry}</dt>
                <dd className="text-right font-medium">
                  {countryFlagEmoji(founder.countryCode)} {founder.countryName}
                </dd>
                <dt className="text-ink-3">{t.cardRank}</dt>
                <dd className="text-right font-mono font-semibold text-brand">×{founder.entryMultiplier}</dd>
                <dt className="text-ink-3">{t.cardPoints}</dt>
                <dd className="text-right font-mono font-semibold tabular-nums">
                  {founder.totalPoints.toLocaleString(lang)}
                </dd>
              </dl>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-ink-2">
                {t.cardBackLines.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Renders the founder card to a 1200×630 PNG (client-side canvas, no upload). */
export async function renderFounderCardPng(
  founder: FounderCardData,
  t: FoundersPromoCopy,
  lang: string,
): Promise<Blob | null> {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0369a1");
  g.addColorStop(0.55, "#4f46e5");
  g.addColorStop(1.3, "#f59e0b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.arc(W - 60, 40, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(252,211,77,0.18)";
  ctx.beginPath();
  ctx.arc(80, H + 40, 260, 0, Math.PI * 2);
  ctx.fill();

  const logo = await loadImage("/brand/people-lockup-dark-3x.png");
  if (logo) {
    const h = 72;
    ctx.drawImage(logo, 72, 64, (logo.naturalWidth / logo.naturalHeight) * h, h);
  }

  const font = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 34px ${font}`;
  ctx.fillText(t.cardFounder.toUpperCase(), 72, 300);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 150px ui-monospace, 'SFMono-Regular', Menlo, monospace`;
  ctx.fillText(`#${formatFounderDisplayNumber(founder.founderNumber, lang)}`, 66, 440);
  ctx.font = `500 34px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(`${founder.countryName} · ${t.cardNetwork}`, 72, 540);
  ctx.textAlign = "right";
  ctx.fillText(t.eyebrow, W - 72, 540);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
