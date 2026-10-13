import { formatUnits } from "viem";

const PPL_DECIMALS = 18;

export interface TallyTotals {
  yes: number;
  no: number;
  abstain: number;
  noWithVeto: number;
}

/** `*_count` fields on the tally REST response are plain "appl" integers, same units as a `Coin.amount`. */
export function tallyToPpl(tally: { yes_count: string; no_count: string; abstain_count: string; no_with_veto_count: string }): TallyTotals {
  return {
    yes: Number(formatUnits(BigInt(tally.yes_count || "0"), PPL_DECIMALS)),
    no: Number(formatUnits(BigInt(tally.no_count || "0"), PPL_DECIMALS)),
    abstain: Number(formatUnits(BigInt(tally.abstain_count || "0"), PPL_DECIMALS)),
    noWithVeto: Number(formatUnits(BigInt(tally.no_with_veto_count || "0"), PPL_DECIMALS)),
  };
}

export function tallyTotal(tally: TallyTotals): number {
  return tally.yes + tally.no + tally.abstain + tally.noWithVeto;
}

/** Share of bonded stake that has voted, 0-100. Quorum excludes abstains from the "yes/no/veto" numerator per the SDK, but counts them for quorum itself. */
export function quorumPercent(tally: TallyTotals, bondedTokens: bigint): number {
  const bonded = Number(formatUnits(bondedTokens, PPL_DECIMALS));
  if (bonded <= 0) return 0;
  return (tallyTotal(tally) / bonded) * 100;
}

/** Yes share of the non-abstain vote, 0-100 — what `threshold` is compared against. */
export function yesThresholdPercent(tally: TallyTotals): number {
  const denom = tally.yes + tally.no + tally.noWithVeto;
  if (denom <= 0) return 0;
  return (tally.yes / denom) * 100;
}

/** Veto share of the non-abstain vote, 0-100 — what `veto_threshold` is compared against. */
export function vetoThresholdPercent(tally: TallyTotals): number {
  const denom = tally.yes + tally.no + tally.noWithVeto;
  if (denom <= 0) return 0;
  return (tally.noWithVeto / denom) * 100;
}

export function decToPercent(dec: string): number {
  return Number(dec) * 100;
}
