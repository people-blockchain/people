"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { encodePacked, keccak256, parseEther, stringToHex } from "viem";
import { useLanguage } from "@/context/LanguageContext";
import { describePreflightError } from "@/lib/tx-preflight-copy";
import { lavkaPublic } from "@/lib/lavka-public-content";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { useExternalWallet, writeViaActiveSigner, readPublicClient } from "@/context/ExternalWalletContext";
import {
  lavkaPassAbi,
  lavkaPassAddress,
  lavkaPaymentsAbi,
  lavkaPaymentsAddress,
  merchantEscrowAbi,
  merchantEscrowAddress,
} from "@/lib/lavka/contracts";

export type VenueMode = "buy" | "redeem" | "pay" | "escrow";

/** Mirrors `MerchantEscrow.MIN_ESCROW_DURATION` (contracts/src/lavka/MerchantEscrow.sol). */
const MIN_ESCROW_DAYS = 3;

type VenueData = {
  contractsReady: boolean;
  merchant: {
    slug: string;
    displayName: string;
    walletAddress: string;
    ratingAvg: number;
    ratingCount: number;
  };
  programs: {
    id: string;
    chainProgramId: number;
    title: string;
    pricePpl: number;
  }[];
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export function LavkaVenueClient({ slug, mode }: { slug: string; mode: VenueMode }) {
  const { lang } = useLanguage();
  const t = lavkaPublic[lang];
  const { signer } = useExternalWallet();
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string>("");
  const [amount, setAmount] = useState("1");
  const [deadlineDays, setDeadlineDays] = useState(String(MIN_ESCROW_DAYS * 2));
  const [terms, setTerms] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [visitsLeft, setVisitsLeft] = useState<number | null>(null);
  const [founderLine, setFounderLine] = useState<string | null>(null);

  const title = useMemo(() => {
    if (mode === "buy") return t.venueBuyTitle;
    if (mode === "redeem") return t.venueRedeemTitle;
    if (mode === "pay") return t.venuePayTitle;
    return t.venueEscrowTitle;
  }, [mode, t]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/lavka/venue/${slug}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as VenueData;
      setVenue(data);
      if (data.programs[0]) setProgramId(data.programs[0].id);
    } catch {
      setError(t.errorLoad);
    }
  }, [slug, t.errorLoad]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProgram = venue?.programs.find((p) => p.id === programId) ?? venue?.programs[0];

  const refreshBalance = useCallback(async () => {
    const pass = lavkaPassAddress();
    if (!pass || !signer || !selectedProgram) return;
    const client = readPublicClient();
    const bal = await client.readContract({
      address: pass,
      abi: lavkaPassAbi,
      functionName: "balanceOf",
      args: [signer.address, BigInt(selectedProgram.chainProgramId)],
    });
    setVisitsLeft(Number(bal));
  }, [signer, selectedProgram]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const runBuy = async () => {
    const pass = lavkaPassAddress();
    if (!signer || !pass || !selectedProgram) return;
    setBusy(true);
    setError(null);
    try {
      const value = parseEther(String(selectedProgram.pricePpl || 0));
      const hash = await writeViaActiveSigner(signer, {
        address: pass,
        abi: lavkaPassAbi,
        functionName: "purchasePass",
        args: [BigInt(selectedProgram.chainProgramId)],
        value,
      });
      const client = readPublicClient();
      await client.waitForTransactionReceipt({ hash });
      setMessage(t.successProgram);
      await refreshBalance();
    } catch (err) {
      setError(describePreflightError(err, lang)?.text ?? t.errorTx);
    } finally {
      setBusy(false);
    }
  };

  const runRedeem = async () => {
    const pass = lavkaPassAddress();
    if (!signer || !pass || !selectedProgram) return;
    setBusy(true);
    setError(null);
    try {
      // One-time nonce so the on-chain redemption can't be replayed and the merchant's
      // records can be matched to this exact visit (M08-5).
      const nonce = keccak256(stringToHex(`${crypto.randomUUID()}:${Date.now()}`));
      const hash = await writeViaActiveSigner(signer, {
        address: pass,
        abi: lavkaPassAbi,
        functionName: "redeemVisit",
        args: [BigInt(selectedProgram.chainProgramId), BigInt(1), nonce],
      });
      const client = readPublicClient();
      await client.waitForTransactionReceipt({ hash });
      const record = await fetch("/api/lavka/redeem", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        // `visits` is the count this client just redeemed; the server checks it against the
        // on-chain VisitRedeemed event before recording (AUD-M14).
        body: JSON.stringify({ programId: selectedProgram.id, txHash: hash, visits: 1 }),
      });
      if (record.ok) {
        const body = (await record.json()) as { founder?: { status: string; founderNumber?: number } };
        const f = body.founder;
        if (f?.status === "registered" && f.founderNumber) {
          setFounderLine(fill(t.founderWelcome, { n: f.founderNumber }));
        } else if (f?.status === "already_founder" && f.founderNumber) {
          setFounderLine(fill(t.founderAlready, { n: f.founderNumber }));
        }
      }
      setMessage(t.successRedeem);
      await refreshBalance();
    } catch (err) {
      setError(describePreflightError(err, lang)?.text ?? t.errorTx);
    } finally {
      setBusy(false);
    }
  };

  const runPay = async () => {
    const pay = lavkaPaymentsAddress();
    if (!signer || !pay || !venue) return;
    setBusy(true);
    setError(null);
    try {
      const memoHash = keccak256(stringToHex(`lavka:${slug}:${Date.now()}`));
      const hash = await writeViaActiveSigner(signer, {
        address: pay,
        abi: lavkaPaymentsAbi,
        functionName: "payMerchant",
        args: [venue.merchant.walletAddress as `0x${string}`, memoHash],
        value: parseEther(amount),
      });
      const client = readPublicClient();
      await client.waitForTransactionReceipt({ hash });
      setMessage(t.successPay);
    } catch (err) {
      setError(describePreflightError(err, lang)?.text ?? t.errorTx);
    } finally {
      setBusy(false);
    }
  };

  const runEscrow = async () => {
    const escrow = merchantEscrowAddress();
    if (!signer || !escrow || !venue) return;
    setBusy(true);
    setError(null);
    try {
      const client = readPublicClient();
      const days = Number(deadlineDays);
      if (!Number.isFinite(days) || days < MIN_ESCROW_DAYS) {
        setError(fill(t.deadlineTooShort, { n: MIN_ESCROW_DAYS }));
        setBusy(false);
        return;
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + days * 86400);
      const termsHash = keccak256(encodePacked(["string"], [terms.slice(0, 500)]));
      const hash = await writeViaActiveSigner(signer, {
        address: escrow,
        abi: merchantEscrowAbi,
        functionName: "createEscrow",
        args: [venue.merchant.walletAddress as `0x${string}`, deadline, termsHash],
        value: parseEther(amount),
      });
      await client.waitForTransactionReceipt({ hash });
      await fetch("/api/lavka/escrow", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        // The id, amount and deadline are read back from the chain by the API (M08-7); only the
        // note is ours to send, and it must hash to the terms the escrow was created with.
        body: JSON.stringify({
          merchantSlug: slug,
          termsNote: terms,
          createTxHash: hash,
        }),
      });
      setMessage(t.successEscrow);
    } catch (err) {
      setError(describePreflightError(err, lang)?.text ?? t.errorTx);
    } finally {
      setBusy(false);
    }
  };

  const action = () => {
    if (mode === "buy") return runBuy();
    if (mode === "redeem") return runRedeem();
    if (mode === "pay") return runPay();
    return runEscrow();
  };

  const actionLabel =
    mode === "buy"
      ? t.buyButton
      : mode === "redeem"
        ? t.redeemButton
        : mode === "pay"
          ? t.payButton
          : t.escrowButton;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
      <Link href="/lavka" className="text-xs text-brand underline">← {t.title}</Link>
      <h1 className="text-h3 font-bold text-ink">{title}</h1>
      {venue ? (
        <p className="text-sm text-ink-2">{venue.merchant.displayName}</p>
      ) : null}

      {!venue?.contractsReady ? (
        <p className="rounded-xl border border-warm/40 bg-warm/5 px-4 py-3 text-sm">{t.contractsOff}</p>
      ) : null}

      {error ? <p className="text-sm text-warm">{error}</p> : null}
      {message ? <p className="text-sm text-brand">{message}</p> : null}
      {founderLine ? <p className="text-sm font-semibold text-ink">{founderLine}</p> : null}

      {!signer ? (
        <ConnectWalletMenu />
      ) : (
        <div className="surface-elevated space-y-3 rounded-2xl p-5">
          {(mode === "buy" || mode === "redeem") && venue?.programs.length ? (
            <label className="block text-sm">
              <span className="text-ink-3">{t.programsTitle}</span>
              <select
                className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
              >
                {venue.programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>
          ) : null}
          {mode === "redeem" && visitsLeft !== null ? (
            <p className="text-sm text-ink-2">{fill(t.visitsLeft, { n: visitsLeft })}</p>
          ) : null}
          {(mode === "pay" || mode === "escrow") && (
            <label className="block text-sm">
              <span className="text-ink-3">{t.amountLabel}</span>
              <input
                className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          )}
          {mode === "escrow" && (
            <>
              <label className="block text-sm">
                <span className="text-ink-3">{t.deadlineDaysLabel}</span>
                <input
                  type="number"
                  min={MIN_ESCROW_DAYS}
                  step={1}
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                  value={deadlineDays}
                  onChange={(e) => setDeadlineDays(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-3">{t.termsLabel}</span>
                <textarea
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                  rows={3}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                />
              </label>
              <p className="text-xs text-ink-3">{t.escrowLocked}</p>
            </>
          )}
          <button
            type="button"
            className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink"
            disabled={busy || !venue?.contractsReady}
            onClick={() => void action()}
          >
            {busy ? "…" : actionLabel}
          </button>
        </div>
      )}

      <p className="text-xs text-ink-3">{t.pohRequired}</p>
      <Link href={`/login?callbackUrl=/lavka/v/${slug}/${mode}`} className="text-xs text-brand underline">{t.signInCta}</Link>
    </div>
  );
}
