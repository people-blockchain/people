"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { parseEther } from "viem";
import { useLanguage } from "@/context/LanguageContext";
import { lavkaPublic } from "@/lib/lavka-public-content";
import { FOUNDER_COUNTRY_OPTIONS } from "@/lib/founders/countries";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { useExternalWallet, writeViaActiveSigner, readPublicClient } from "@/context/ExternalWalletContext";
import { LAVKA_MAX_VISITS_PER_PURCHASE, lavkaPassAbi, lavkaPassAddress } from "@/lib/lavka/contracts";
import { MAX_MERCHANT_DISPLAY_NAME, MAX_PROGRAM_TITLE } from "@/lib/lavka/limits";
import { Chip, Eyebrow } from "@/components/ui/primitives";

type Me = {
  signedIn: boolean;
  verifiedHuman: boolean;
  contractsReady: boolean;
  merchant: {
    slug: string;
    displayName: string;
    countryCode: string;
    walletAddress: string;
    ratingAvg: number;
    ratingCount: number;
  } | null;
  programs: {
    id: string;
    chainProgramId: number;
    title: string;
    visitsPerPurchase: number;
    pricePpl: number;
  }[];
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export function LavkaMerchantApp() {
  const { lang } = useLanguage();
  const t = lavkaPublic[lang];
  const { signer } = useExternalWallet();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("GE");
  const [saving, setSaving] = useState(false);
  const [programTitle, setProgramTitle] = useState("");
  const [visits, setVisits] = useState("5");
  const [pricePpl, setPricePpl] = useState("1");
  const [validDays, setValidDays] = useState("90");
  const [transferable, setTransferable] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/lavka/me", { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as Me;
      setMe(data);
      if (data.merchant) {
        setDisplayName(data.merchant.displayName);
        setCountryCode(data.merchant.countryCode);
      }
    } catch {
      setError(t.errorLoad);
    }
  }, [t.errorLoad]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveMerchant = async () => {
    if (displayName.trim().length < 2) {
      setError(t.errorName);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/lavka/merchant", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, countryCode }),
      });
      if (!res.ok) throw new Error("save");
      await load();
    } catch {
      setError(t.errorLoad);
    } finally {
      setSaving(false);
    }
  };

  const publishProgram = async () => {
    const pass = lavkaPassAddress();
    if (!signer || !pass || !me?.merchant) return;
    // AUD-M10: `LavkaPass.createProgram` reverts on a zero price (`ZeroPrice`) and on more than
    // MAX_VISITS_PER_PURCHASE visits (`TooManyVisits`); fail fast here with a message instead of
    // sending a transaction that is guaranteed to revert.
    const visitsNum = Number(visits);
    const priceNum = Number(pricePpl);
    if (
      !Number.isInteger(visitsNum) ||
      visitsNum < 1 ||
      visitsNum > LAVKA_MAX_VISITS_PER_PURCHASE ||
      !Number.isFinite(priceNum) ||
      priceNum <= 0
    ) {
      setError(t.errorProgramTerms);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const client = readPublicClient();
      const days = Number(validDays);
      const validUntil =
        Number.isFinite(days) && days > 0
          ? BigInt(Math.floor(Date.now() / 1000) + days * 86400)
          : BigInt(0);
      const priceWei = parseEther(String(priceNum));
      const hash = await writeViaActiveSigner(signer, {
        address: pass,
        abi: lavkaPassAbi,
        functionName: "createProgram",
        args: [Number(visits), validUntil, transferable, priceWei],
      });
      await client.waitForTransactionReceipt({ hash });
      const res = await fetch("/api/lavka/programs", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: programTitle, createTxHash: hash }),
      });
      if (!res.ok) throw new Error("api");
      setProgramTitle("");
      await load();
    } catch {
      setError(t.errorTx);
    } finally {
      setCreating(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const slug = me?.merchant?.slug;

  const copy = async (path: string) => {
    await navigator.clipboard.writeText(`${origin}${path}`);
    setCopied(path);
    window.setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="relative isolate overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-[radial-gradient(45%_70%_at_85%_0%,rgba(245,158,11,0.14),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(45%_70%_at_85%_0%,rgba(251,191,36,0.12),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(76,196,248,0.12),transparent_70%)]"
          aria-hidden="true"
        />
        <Eyebrow>{t.tag}</Eyebrow>
        <h1 className="mt-2 text-h2 font-bold text-ink">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-ink-2">{t.lead}</p>
        <p className="mt-2 text-xs text-ink-3">{t.preliminaryBanner}</p>
      </header>

      {!me?.contractsReady ? (
        <p className="rounded-xl border border-warm/40 bg-warm/5 px-4 py-3 text-sm text-ink-2">{t.contractsOff}</p>
      ) : null}

      {error ? <p className="text-sm text-warm">{error}</p> : null}

      {!me?.signedIn ? (
        <Link href="/login?callbackUrl=/lavka" className="text-brand underline">{t.signInCta}</Link>
      ) : null}

      {me?.signedIn && !me.verifiedHuman ? (
        <div className="surface-elevated rounded-3xl p-5">
          <p className="text-sm text-ink-2">{t.pohRequired}</p>
          <Link href="/login?callbackUrl=/lavka" className="mt-3 inline-block text-brand underline">{t.walletCta}</Link>
        </div>
      ) : null}

      {me?.signedIn && me.verifiedHuman ? (
        <>
          <section className="surface-elevated rounded-3xl p-5">
            <h2 className="text-base font-bold text-ink">{t.merchantTitle}</h2>
            <p className="mt-2 text-sm text-ink-2">{t.merchantLead}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-ink-3">{t.displayNameLabel}</span>
                <input
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                  value={displayName}
                  maxLength={MAX_MERCHANT_DISPLAY_NAME}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-3">{t.countryLabel}</span>
                <select
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                >
                  {FOUNDER_COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
              disabled={saving}
              onClick={() => void saveMerchant()}
            >
              {saving ? t.saving : t.saveMerchant}
            </button>
          </section>

          {me.merchant ? (
            <>
              <section className="surface-elevated rounded-3xl p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="value">{me.merchant.displayName}</Chip>
                  <span className="text-xs text-ink-3">
                    {me.merchant.ratingCount > 0
                      ? fill(t.ratingValue, {
                          score: me.merchant.ratingAvg.toFixed(1),
                          count: me.merchant.ratingCount,
                        })
                      : t.noRating}
                  </span>
                </div>
                <h2 className="mt-4 text-base font-bold text-ink">{t.programsTitle}</h2>
                {!signer ? (
                  <div className="mt-4">
                    <ConnectWalletMenu />
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    <input
                      className="w-full rounded-xl border border-line px-3 py-2"
                      placeholder={t.programTitleLabel}
                      value={programTitle}
                      maxLength={MAX_PROGRAM_TITLE}
                      onChange={(e) => setProgramTitle(e.target.value)}
                    />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input
                        className="rounded-xl border border-line px-3 py-2"
                        placeholder={t.visitsLabel}
                        value={visits}
                        onChange={(e) => setVisits(e.target.value)}
                      />
                      <input
                        className="rounded-xl border border-line px-3 py-2"
                        placeholder={t.priceLabel}
                        value={pricePpl}
                        onChange={(e) => setPricePpl(e.target.value)}
                      />
                      <input
                        className="rounded-xl border border-line px-3 py-2"
                        placeholder={t.validDaysLabel}
                        value={validDays}
                        onChange={(e) => setValidDays(e.target.value)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-ink-2">
                      <input type="checkbox" checked={transferable} onChange={(e) => setTransferable(e.target.checked)} />
                      {t.transferableLabel}
                    </label>
                    <button
                      type="button"
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
                      disabled={creating || !lavkaPassAddress()}
                      onClick={() => void publishProgram()}
                    >
                      {creating ? t.creating : t.createProgram}
                    </button>
                  </div>
                )}
                <ul className="mt-6 space-y-3">
                  {me.programs.map((p) => (
                    <li key={p.id} className="rounded-xl border border-line px-3 py-2 text-sm">
                      <span className="font-semibold text-ink">{p.title}</span>
                      <span className="text-ink-3"> · #{p.chainProgramId} · {p.visitsPerPurchase} visits · {p.pricePpl} PPL</span>
                    </li>
                  ))}
                </ul>
              </section>

              {slug ? (
                <section className="surface-elevated rounded-3xl p-5">
                  <h2 className="text-base font-bold text-ink">{t.qrTitle}</h2>
                  <ul className="mt-4 space-y-4 text-sm text-ink-2">
                    {[
                      { path: `/lavka/v/${slug}/redeem`, hint: t.qrRedeemHint },
                      { path: `/lavka/v/${slug}/buy`, hint: t.qrBuyHint },
                      { path: `/lavka/v/${slug}/pay`, hint: t.qrPayHint },
                      { path: `/lavka/v/${slug}/escrow`, hint: t.qrEscrowHint },
                    ].map((row) => (
                      <li key={row.path}>
                        <p>{row.hint}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Link href={row.path} className="font-mono text-xs text-brand underline">{row.path}</Link>
                          <button
                            type="button"
                            className="rounded-lg border border-line px-2 py-1 text-xs"
                            onClick={() => void copy(row.path)}
                          >
                            {copied === row.path ? t.copied : t.copyLink}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
