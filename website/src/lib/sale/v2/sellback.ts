import { V2_PHASES, V2_SALE, type V2Phase } from "./constants";

/** 30 days, matching `PplCurveHubV2.HOLD`. */
export const HOLD_SECONDS = V2_SALE.holdDays * 24 * 60 * 60;

export type SellLot = {
  boughtAtSec: number;
  pplRemaining: bigint;
};

export type SellBackAvailability = {
  unlockedPpl: bigint;
  nextUnlockSec: number | null;
};

/**
 * FIFO, same as `sellableNow`: count unlocked lots from the head and stop at
 * the first lot still inside the 30-day hold. Later lots are not reachable yet.
 */
export function sellBackAvailability(
  lots: readonly SellLot[],
  nowSec: number,
  maxLots: number = 50,
): SellBackAvailability {
  let unlockedPpl = BigInt(0);
  let touched = 0;
  for (const lot of lots) {
    if (lot.pplRemaining <= BigInt(0)) continue;
    if (touched >= maxLots) break;
    touched += 1;
    const unlockSec = lot.boughtAtSec + HOLD_SECONDS;
    if (unlockSec > nowSec) return { unlockedPpl, nextUnlockSec: unlockSec };
    unlockedPpl += lot.pplRemaining;
  }
  return { unlockedPpl, nextUnlockSec: null };
}

/** `low` is 1.5%, `high` is 3%, `mixed` crosses the 1%-of-reserve line. */
export function sellBackFeeBand(
  grossUsd6: bigint,
  feeLowRemainingUsd6: bigint,
): "low" | "high" | "mixed" {
  if (grossUsd6 <= BigInt(0)) return "low";
  if (feeLowRemainingUsd6 <= BigInt(0)) return "high";
  if (grossUsd6 <= feeLowRemainingUsd6) return "low";
  return "mixed";
}

/** Payout minus the same 1% slippage the buy path uses, rounded down. */
export function minUsdcOutFromPayout(payoutUsd6: bigint, slippageBps: number = V2_SALE.slippageBps): bigint {
  if (payoutUsd6 <= BigInt(0)) return BigInt(0);
  const denom = BigInt(10_000);
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(slippageBps))));
  return (payoutUsd6 * (denom - bps)) / denom;
}

/** Sell-back stays open through the term (`Expired`) and stops at graduation. */
export function sellBackOpen(phase: V2Phase): boolean {
  return phase !== V2_PHASES.NotOpen && phase !== V2_PHASES.Graduated;
}

const REVERT_KEYS: Record<string, string> = {
  NotEnoughUnlocked: "notEnough",
  GlobalDayCap: "globalCap",
  PersonDayCap: "personalCap",
  Slippage: "slippage",
  SellBackClosed: "closed",
  SellBackDisabled: "disabled",
  ReturnUsed: "used",
  Expired: "expired",
  BadSignature: "badSignature",
  BelowMinSell: "belowMin",
  TooManySells: "tooMany",
  ReserveExhausted: "reserve",
  ZeroOut: "notEnough",
};

export function sellBackErrorKey(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string; code?: number; reason?: string } | null;
  if (e?.code === 4001 || e?.reason === "rejected") return "rejected";
  const raw = `${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
  if (raw === "rejected" || /\brejected\b/i.test(raw)) return "rejected";
  for (const [name, key] of Object.entries(REVERT_KEYS)) {
    if (raw.includes(name)) return key;
  }
  if (/reverted/i.test(raw)) return "reverted";
  return "error";
}
