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

/** 5% headroom so a price move between this check and the burn does not cross a cap. */
export const SELL_PREFLIGHT_HEADROOM_BPS = BigInt(500);

export type SellBackPreflight = {
  opened: boolean;
  paused: boolean;
  liquidityReleased: boolean;
  returnVerifier: string;
  sellablePpl: bigint;
  pplIn: bigint;
  grossUsd6: bigint;
  payoutUsd6: bigint;
  personalRemainingUsd6: bigint;
  globalRemainingUsd6: bigint;
};

/**
 * Checks a sell can be paid before PPL are burned. Caps use a 5% price margin.
 * Graduation does not close the check; liquidity release does.
 */
export function sellBackPreflight(input: SellBackPreflight): { ok: true } | { ok: false; reason: string } {
  if (!input.opened || input.liquidityReleased) return { ok: false, reason: "closed" };
  if (input.paused) return { ok: false, reason: "paused" };
  if (input.returnVerifier.toLowerCase() === "0x0000000000000000000000000000000000000000" || input.returnVerifier === "") {
    return { ok: false, reason: "disabled" };
  }
  if (input.pplIn <= BigInt(0) || input.pplIn > input.sellablePpl) return { ok: false, reason: "notEnough" };
  if (input.grossUsd6 <= BigInt(0) || input.payoutUsd6 <= BigInt(0)) return { ok: false, reason: "notEnough" };
  const padded = (input.grossUsd6 * (BigInt(10_000) + SELL_PREFLIGHT_HEADROOM_BPS)) / BigInt(10_000);
  if (padded > input.personalRemainingUsd6) return { ok: false, reason: "personalCap" };
  if (padded > input.globalRemainingUsd6) return { ok: false, reason: "globalCap" };
  return { ok: true };
}

/**
 * Largest amount in `(0, pplIn]` whose quoted gross fits both remaining caps.
 * `grossOf` must be non-decreasing. Returns 0 when nothing positive fits.
 */
export function largestPplUnderCaps(
  pplIn: bigint,
  grossOf: (ppl: bigint) => bigint,
  personalRemainingUsd6: bigint,
  globalRemainingUsd6: bigint,
): bigint {
  const fits = (ppl: bigint) => {
    if (ppl <= BigInt(0)) return false;
    const gross = grossOf(ppl);
    return gross > BigInt(0) && gross <= personalRemainingUsd6 && gross <= globalRemainingUsd6;
  };
  if (pplIn <= BigInt(0)) return BigInt(0);
  if (fits(pplIn)) return pplIn;
  let lo = BigInt(0);
  let hi = pplIn;
  let best = BigInt(0);
  for (let i = 0; i < 40 && lo + BigInt(1) < hi; i++) {
    const mid = (lo + hi) / BigInt(2);
    if (fits(mid)) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

/** Sell-back stays available from open through graduation. Liquidity release is a separate flag. */
export function sellBackOpen(phase: V2Phase): boolean {
  return phase !== V2_PHASES.NotOpen;
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
