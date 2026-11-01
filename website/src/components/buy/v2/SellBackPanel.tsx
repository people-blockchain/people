"use client";

import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";

import type { EIP1193Provider } from "@/lib/evm/client";
import { intlLocale, ppl, usd } from "@/lib/sale/format";
import { pplWeiToNumber, usd6ToNumber, validV2Address, type V2Chain } from "@/lib/sale/v2/logic";
import { newBurnAllowed } from "@/lib/sale/v2/pending-payout";
import { sellBackOpen } from "@/lib/sale/v2/sellback";
import {
  formatPplInput,
  parsePplInput,
  usePendingPayouts,
  useV2SellBack,
  useV2SellBackView,
} from "@/lib/sale/v2/useV2SellBack";
import type { V2Phase } from "@/lib/sale/v2/constants";

const FIELD =
  "mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";

export type SellBackCopy = {
  title: string;
  cta: string;
  available: string;
  unlock: string;
  noneYet: string;
  personal: string;
  personalHint: string;
  global: string;
  globalHint: string;
  fee: string;
  feeLow: string;
  feeHigh: string;
  feeMixed: string;
  receive: string;
  amount: string;
  max: string;
  burning: string;
  attesting: string;
  selling: string;
  done: string;
  payoutNote: string;
  error: string;
  rejected: string;
  notConfigured: string;
  notEnough: string;
  globalCap: string;
  personalCap: string;
  slippage: string;
  closed: string;
  disabled: string;
  used: string;
  expired: string;
  badSignature: string;
  belowMin: string;
  tooMany: string;
  reserve: string;
  reverted: string;
  switchRejected: string;
  pendingTitle: string;
  pendingBody: string;
  continuePayout: string;
  confirmAnotherSale: string;
};

const ERROR_KEYS = [
  "rejected",
  "notConfigured",
  "notEnough",
  "globalCap",
  "personalCap",
  "slippage",
  "closed",
  "disabled",
  "used",
  "expired",
  "badSignature",
  "belowMin",
  "tooMany",
  "reserve",
  "reverted",
  "switchRejected",
] as const;

function messageFor(copy: SellBackCopy, reason: string): string {
  if ((ERROR_KEYS as readonly string[]).includes(reason)) return copy[reason as (typeof ERROR_KEYS)[number]];
  return copy.error;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

export function SellBackPanel({
  chain,
  account,
  provider,
  personId,
  phase,
  lang,
  copy,
  preview,
  refreshKey,
  burnAddress,
  onDone,
}: {
  chain: V2Chain;
  account: Address | null;
  provider: EIP1193Provider | undefined;
  personId: Hex | null;
  phase: V2Phase;
  lang: string;
  copy: SellBackCopy;
  preview: boolean;
  refreshKey: number;
  burnAddress: string | null;
  onDone: () => void;
}) {
  const open = sellBackOpen(phase) && Boolean(personId);
  const [amount, setAmount] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [allowAnother, setAllowAnother] = useState(false);
  const parsed = parsePplInput(amount);
  const { status, sellBack, resumePayout, busy } = useV2SellBack();
  const burn = validV2Address(burnAddress ?? undefined);
  const { pending } = usePendingPayouts({
    chain,
    account,
    burnAddress: burn,
    enabled: open && !preview && Boolean(account),
    refreshKey: refreshKey + status.step.length,
  });
  const view = useV2SellBackView({
    chain,
    account,
    pplIn: parsed ?? BigInt(0),
    enabled: open && !preview,
    refreshKey,
  });

  useEffect(() => {
    if (seeded || preview || view.unlockedPpl <= BigInt(0)) return;
    setAmount(formatPplInput(view.unlockedPpl));
    setSeeded(true);
  }, [preview, seeded, view.unlockedPpl]);

  if (!open && !preview) return null;

  const unlocked = preview ? BigInt(0) : view.unlockedPpl;
  const feeLabel = view.feeBand === "high" ? copy.feeHigh : view.feeBand === "mixed" ? copy.feeMixed : copy.feeLow;
  const tooMuch = parsed !== null && parsed > unlocked;
  const anotherBurn = newBurnAllowed(pending.length, allowAnother);
  const canSubmit = Boolean(
    !preview &&
      provider &&
      account &&
      personId &&
      burn &&
      parsed &&
      !tooMuch &&
      parsed <= unlocked &&
      !busy &&
      !view.loading &&
      anotherBurn,
  );

  const onSubmit = async () => {
    if (!canSubmit || !provider || !account || !personId || !burn || !parsed) return;
    if (!newBurnAllowed(pending.length, allowAnother)) return;
    const done = await sellBack({
      chain,
      provider,
      account,
      personId,
      pplIn: parsed,
      burnAddress: burn as Address,
      allowAnotherBurn: anotherBurn,
    });
    if (done) onDone();
  };

  const onContinue = async (returnId: string) => {
    const item = pending.find((row) => row.returnId.toLowerCase() === returnId.toLowerCase());
    if (!item || !provider || !account || !personId || !burn || busy) return;
    const done = await resumePayout({
      chain,
      provider,
      account,
      personId,
      burnAddress: burn as Address,
      pending: item,
    });
    if (done) onDone();
  };

  return (
    <section className="mt-4 space-y-3 rounded-2xl border border-line bg-surface p-4" data-testid="v2-return-panel">
      <h3 className="text-sm font-semibold text-ink">{copy.title}</h3>
      <p className="text-xs text-ink-3">{copy.payoutNote}</p>
      {pending.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3" data-testid="v2-pending-payouts">
          <p className="text-sm font-semibold text-ink">{copy.pendingTitle}</p>
          <p className="text-xs text-ink-2">{copy.pendingBody}</p>
          {pending.map((item) => (
            <button
              key={item.returnId}
              type="button"
              onClick={() => void onContinue(item.returnId)}
              disabled={busy}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface disabled:opacity-55"
              data-testid="v2-continue-payout"
            >
              {copy.continuePayout}
            </button>
          ))}
          {!allowAnother ? (
            <button
              type="button"
              onClick={() => setAllowAnother(true)}
              className="text-xs font-semibold text-ink-2 underline"
              data-testid="v2-confirm-another-sale"
            >
              {copy.confirmAnotherSale}
            </button>
          ) : null}
        </div>
      ) : null}
      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-2">{copy.available}</dt>
          <dd className="font-mono font-semibold text-ink" data-testid="v2-return-available">
            {preview ? "—" : `${ppl(pplWeiToNumber(unlocked), lang)} PPL`}
          </dd>
        </div>
        <div className="text-xs text-ink-3" data-testid="v2-return-unlock">
          {view.nextUnlockSec
            ? fill(copy.unlock, {
                date: new Date(view.nextUnlockSec * 1000).toLocaleDateString(intlLocale(lang), {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }),
              })
            : unlocked > BigInt(0)
              ? null
              : copy.noneYet}
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-2">{copy.personal}</dt>
          <dd className="text-right text-ink" data-testid="v2-return-personal">
            {fill(copy.personalHint, { amount: preview ? "—" : usd(usd6ToNumber(view.personalRemainingUsd6), lang) })}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-2">{copy.global}</dt>
          <dd className="text-right text-ink" data-testid="v2-return-global">
            {fill(copy.globalHint, { amount: preview ? "—" : usd(usd6ToNumber(view.globalRemainingUsd6), lang) })}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-2">{copy.fee}</dt>
          <dd className="text-ink" data-testid="v2-return-fee">
            {preview ? copy.feeLow : `${feeLabel} · ${usd(usd6ToNumber(view.feeUsd6), lang)}`}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-2">{copy.receive}</dt>
          <dd className="font-mono font-semibold text-ink" data-testid="v2-return-payout">
            {preview ? "—" : `${usd(usd6ToNumber(view.payoutUsd6), lang)} USDC`}
          </dd>
        </div>
      </dl>
      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
        {copy.amount}
        <input
          className={FIELD}
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          data-testid="v2-return-amount"
        />
      </label>
      <button
        type="button"
        className="text-xs font-semibold text-brand"
        onClick={() => setAmount(formatPplInput(unlocked))}
        disabled={unlocked <= BigInt(0)}
      >
        {copy.max}
      </button>
      {status.step === "burning" || status.step === "attesting" || status.step === "selling" ? (
        <p className="text-sm text-ink-2" role="status">
          {status.step === "burning" ? copy.burning : status.step === "attesting" ? copy.attesting : copy.selling}
        </p>
      ) : null}
      {status.step === "done" ? (
        <p className="text-sm text-ink" role="status" data-testid="v2-return-done">
          {copy.done}
        </p>
      ) : null}
      {status.step === "error" ? (
        <p className="text-sm text-warm" role="alert" data-testid="v2-return-error">
          {messageFor(copy, status.reason)}
        </p>
      ) : null}
      {tooMuch ? (
        <p className="text-sm text-warm" role="alert">
          {copy.notEnough}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void onSubmit()}
        disabled={!canSubmit}
        className="inline-flex min-h-13 w-full items-center justify-center rounded-full border border-line bg-surface-2 px-6 py-3.5 text-base font-semibold text-ink transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-55"
        data-testid="v2-return-cta"
      >
        {status.step === "burning"
          ? copy.burning
          : status.step === "attesting"
            ? copy.attesting
            : status.step === "selling"
              ? copy.selling
              : copy.cta}
      </button>
    </section>
  );
}
