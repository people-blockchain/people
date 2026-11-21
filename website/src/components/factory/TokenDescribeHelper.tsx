"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { factoryCopy } from "@/lib/factory-content";
import { formatSpotPpl } from "@/lib/token-curve-start-price";

type PricePayload = {
  spotPplPerWholeToken: number;
  spotPplFormatted: string;
  bondingCurveWholeTokens: string;
  virtualNativePpl: number;
};

type ApplyPayload = {
  name: string;
  symbol: string;
  supply: string;
  rationale: string;
  warnings: string[];
  price: PricePayload;
  source: string;
};

type Props = {
  onApply: (payload: ApplyPayload) => void;
};

type ApiOk = ApplyPayload & { warnings: string[] };

export function TokenDescribeHelper({ onApply }: Props) {
  const { lang } = useLanguage();
  const copy = { ...factoryCopy.en.tokenDescribe!, ...factoryCopy[lang].tokenDescribe };
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ApplyPayload | null>(null);

  const warningText = (code: string) => {
    if (code === "fundraising_not_guaranteed") return copy.warnFundraising;
    if (code === "dollar_not_configurable") return copy.warnDollar;
    return code;
  };

  const priceExplanation = (price: PricePayload) =>
    copy.priceExplain
      .replaceAll("{{virtual}}", String(price.virtualNativePpl))
      .replaceAll("{{curve}}", BigInt(price.bondingCurveWholeTokens).toLocaleString(lang))
      .replaceAll("{{spot}}", price.spotPplFormatted || formatSpotPpl(price.spotPplPerWholeToken));

  const submit = async () => {
    if (busy || text.trim().length < 12) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/factory/token/describe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: text.trim(), lang }),
      });
      const body = (await res.json().catch(() => ({}))) as ApiOk & { error?: string };
      if (!res.ok) {
        setError(
          body.error === "rate_limited"
            ? copy.errorRateLimited
            : body.error === "description_too_short"
              ? copy.errorTooShort
              : copy.errorGeneric,
        );
        return;
      }
      const payload: ApplyPayload = {
        name: body.name,
        symbol: body.symbol,
        supply: body.supply,
        rationale: body.rationale,
        warnings: body.warnings ?? [],
        price: body.price,
        source: body.source,
      };
      setPreview(payload);
      onApply(payload);
    } catch {
      setError(copy.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-xl border border-brand/25 bg-surface p-4"
      data-testid="token-describe-helper"
    >
      <p className="text-sm font-semibold text-ink">{copy.title}</p>
      <p className="mt-1 text-xs text-ink-3">{copy.lead}</p>
      <textarea
        className="mt-3 min-h-[7rem] w-full resize-y rounded-xl border border-line px-3 py-3 text-sm"
        placeholder={copy.placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={4000}
        disabled={busy}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || text.trim().length < 12}
          onClick={() => void submit()}
          className="rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
        >
          {busy ? copy.busy : copy.submit}
        </button>
        <p className="text-xs text-ink-3">{copy.reviewNote}</p>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-warm" role="alert">
          {error}
        </p>
      ) : null}
      {preview ? (
        <div className="mt-4 space-y-2 rounded-xl border border-line bg-canvas p-3 text-sm text-ink-2">
          <p className="font-semibold text-ink">{copy.priceTitle}</p>
          <p className="font-mono tabular-nums text-violet">
            {copy.priceSpot.replaceAll("{{spot}}", preview.price.spotPplFormatted)}
          </p>
          <p>{priceExplanation(preview.price)}</p>
          {preview.rationale ? <p>{preview.rationale}</p> : null}
          {preview.warnings.map((w) => (
            <p key={w} className="text-xs text-warm">
              {warningText(w)}
            </p>
          ))}
          <p className="text-xs text-ink-3">{copy.sourceNote.replace("{{source}}", preview.source)}</p>
        </div>
      ) : null}
    </section>
  );
}