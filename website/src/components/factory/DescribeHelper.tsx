"use client";

import { useState, type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { factoryCopy } from "@/lib/factory-content";
import type { DescribeHelperKind } from "@/lib/describe-helper-kinds";
import { formatSpotPpl } from "@/lib/token-curve-start-price";

type PricePayload = {
  spotPplPerWholeToken: number;
  spotPplFormatted: string;
  bondingCurveWholeTokens: string;
  virtualNativePpl: number;
};

export type DescribeHelperPayload = Record<string, unknown> & {
  rationale?: string;
  warnings?: string[];
  source?: string;
  price?: PricePayload;
};

type Props = {
  kind: DescribeHelperKind;
  extraBody?: Record<string, unknown>;
  onApply: (payload: DescribeHelperPayload) => void;
  previewExtra?: (payload: DescribeHelperPayload) => ReactNode;
};

export function DescribeHelper({ kind, extraBody, onApply, previewExtra }: Props) {
  const { lang } = useLanguage();
  const copy = { ...factoryCopy.en.tokenDescribe!, ...factoryCopy[lang].tokenDescribe };
  const lead =
    kind === "nft"
      ? copy.nftLead
      : kind === "contract"
        ? copy.contractLead
        : kind === "discover"
          ? copy.discoverLead
          : kind === "lavka"
            ? copy.lavkaLead
            : copy.lead;
  const placeholder =
    kind === "nft"
      ? copy.nftPlaceholder
      : kind === "contract"
        ? copy.contractPlaceholder
        : kind === "discover"
          ? copy.discoverPlaceholder
          : kind === "lavka"
            ? copy.lavkaPlaceholder
            : copy.placeholder;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<DescribeHelperPayload | null>(null);

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
      const res = await fetch(`/api/factory/${kind}/describe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: text.trim(), lang, type: kind, ...extraBody }),
      });
      const body = (await res.json().catch(() => ({}))) as DescribeHelperPayload & { error?: string };
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
      setPreview(body);
      onApply(body);
    } catch {
      setError(copy.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-xl border border-brand/25 bg-surface p-4"
      data-testid={`${kind}-describe-helper`}
    >
      <p className="text-sm font-semibold text-ink">{copy.title}</p>
      <p className="mt-1 text-xs text-ink-3">{lead}</p>
      <textarea
        className="mt-3 min-h-[7rem] w-full resize-y rounded-xl border border-line px-3 py-3 text-sm"
        placeholder={placeholder}
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
          {kind === "token" && preview.price ? (
            <>
              <p className="font-semibold text-ink">{copy.priceTitle}</p>
              <p className="font-mono tabular-nums text-violet">
                {copy.priceSpot.replaceAll("{{spot}}", preview.price.spotPplFormatted)}
              </p>
              <p>{priceExplanation(preview.price)}</p>
            </>
          ) : null}
          {kind === "contract" && typeof preview.title === "string" ? (
            <p>
              {copy.contractTemplate.replaceAll("{{template}}", preview.title)}
            </p>
          ) : null}
          {previewExtra ? previewExtra(preview) : null}
          {preview.rationale ? <p>{preview.rationale}</p> : null}
          {(preview.warnings ?? []).map((w) => (
            <p key={w} className="text-xs text-warm">
              {warningText(w)}
            </p>
          ))}
          <p className="text-xs text-ink-3">
            {copy.sourceNote.replace("{{source}}", String(preview.source ?? ""))}
          </p>
        </div>
      ) : null}
    </section>
  );
}
