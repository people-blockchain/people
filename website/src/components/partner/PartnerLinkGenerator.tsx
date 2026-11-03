"use client";

import { useState } from "react";
import { PARTNER_CABINET_EN } from "@/lib/partner/cabinet-copy";

type Props = {
  referralCode: string;
  initialKolCode: string | null;
  referralLink: string;
  origin: string;
};

export function PartnerLinkGenerator({
  referralCode,
  initialKolCode,
  referralLink,
  origin,
}: Props) {
  const [kolCode, setKolCode] = useState<string | null>(initialKolCode);
  const [kolInput, setKolInput] = useState<string>(initialKolCode ?? "");
  const [savingKol, setSavingKol] = useState(false);
  const [kolError, setKolError] = useState<string | null>(null);
  const [kolSuccess, setKolSuccess] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const cleanOrigin = origin.replace(/\/$/, "");
  const defaultInviteLink = referralLink || `${cleanOrigin}/?ref=${encodeURIComponent(referralCode)}`;
  const kolInviteLink = kolCode ? `${cleanOrigin}/?ref=${encodeURIComponent(kolCode)}` : null;

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch {
      /* ignore clipboard error */
    }
  }

  async function handleClaimKolCode(e: React.FormEvent) {
    e.preventDefault();
    setKolError(null);
    setKolSuccess(null);
    const candidate = kolInput.trim().toLowerCase();
    if (!/^[a-z0-9]{6,16}$/.test(candidate)) {
      setKolError("KOL code must be 6–16 lowercase letters or numbers.");
      return;
    }
    setSavingKol(true);
    try {
      const res = await fetch("/api/partner/kol-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kolCode: candidate }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        kolCode?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.kolCode) {
        if (data.error === "kol_code_taken") {
          setKolError("This KOL code is already taken by another partner.");
        } else if (data.error === "rate_limited") {
          setKolError("Too many attempts. Please wait a few minutes and try again.");
        } else {
          setKolError("Invalid KOL code format. Use 6–16 lowercase letters or numbers.");
        }
        return;
      }
      setKolCode(data.kolCode);
      setKolInput(data.kolCode);
      setKolSuccess(`Custom KOL code "${data.kolCode}" saved.`);
    } catch {
      setKolError("Network error while saving KOL code. Please try again.");
    } finally {
      setSavingKol(false);
    }
  }

  return (
    <section
      aria-labelledby="partner-links-heading"
      className="rounded-3xl border border-line bg-surface-elevated p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="partner-links-heading" className="text-lg font-semibold text-ink">
            {PARTNER_CABINET_EN.linksSectionTitle}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {PARTNER_CABINET_EN.linksSectionSubtitle}
          </p>
        </div>
        <span className="rounded-full bg-brand-soft px-3 py-1 font-mono text-xs font-semibold text-brand">
          Code: {kolCode ?? referralCode}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="flex flex-col justify-between rounded-2xl border border-line bg-canvas p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              {PARTNER_CABINET_EN.unifiedLinkLabel}
            </p>
            <p className="mt-2 break-all font-mono text-xs text-ink" data-testid="partner-invite-link">
              {defaultInviteLink}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyText("invite", defaultInviteLink)}
            className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-strong"
          >
            {copiedKey === "invite" ? PARTNER_CABINET_EN.copiedButton : PARTNER_CABINET_EN.copyButton}
          </button>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-line bg-canvas p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              {PARTNER_CABINET_EN.kolLinkLabel}
            </p>
            {kolInviteLink ? (
              <p className="mt-2 break-all font-mono text-xs text-ink" data-testid="partner-kol-link">
                {kolInviteLink}
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink-muted">
                {PARTNER_CABINET_EN.kolSlugEmptyHint}
              </p>
            )}
          </div>
          {kolInviteLink ? (
            <button
              type="button"
              onClick={() => void copyText("kol", kolInviteLink)}
              className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-strong"
            >
              {copiedKey === "kol" ? PARTNER_CABINET_EN.copiedButton : PARTNER_CABINET_EN.copyButton}
            </button>
          ) : null}
        </div>
      </div>

      <form onSubmit={(e) => void handleClaimKolCode(e)} className="mt-5 border-t border-line pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="partner-kol-code-input" className="block text-xs font-semibold text-ink">
              {PARTNER_CABINET_EN.kolSlugLabel}
            </label>
            <p className="mt-0.5 text-xs text-ink-muted">{PARTNER_CABINET_EN.kolSlugHint}</p>
            <input
              id="partner-kol-code-input"
              type="text"
              value={kolInput}
              onChange={(e) => setKolInput(e.target.value)}
              placeholder={PARTNER_CABINET_EN.kolSlugPlaceholder}
              maxLength={16}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3.5 py-2 font-mono text-sm text-ink focus:border-brand focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={savingKol}
            aria-busy={savingKol}
            className="inline-flex h-10 items-center justify-center rounded-full border border-brand bg-brand-soft px-5 text-xs font-semibold text-brand transition hover:bg-brand hover:text-white disabled:opacity-50"
          >
            {savingKol ? PARTNER_CABINET_EN.kolSlugSaving : PARTNER_CABINET_EN.kolSlugSave}
          </button>
        </div>
        {kolError ? (
          <p role="alert" className="mt-2 text-xs font-medium text-rose-700">
            {kolError}
          </p>
        ) : null}
        {kolSuccess ? (
          <p role="status" className="mt-2 text-xs font-medium text-emerald-700">
            {kolSuccess}
          </p>
        ) : null}
      </form>
    </section>
  );
}
