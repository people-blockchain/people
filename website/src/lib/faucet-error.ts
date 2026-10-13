/**
 * User-facing sentence for a faucet `fund` failure. The faucet (chain/scripts/faucet-core.mjs)
 * answers a failed request with `{ error: <code>, message?: <sentence> }`; the codes a person can
 * actually hit are mapped here, everything else (proxy 429/502, a network failure, an unexpected
 * code) collapses to one "unavailable" line. Pure — the caller passes the copy in.
 */
export type FaucetErrorCopy = {
  faucetErrRateLimited: string;
  faucetErrBusy: string;
  faucetErrDailyBudget: string;
  faucetErrUnavailable: string;
};

export function faucetErrorMessage(
  code: string | null | undefined,
  copy: FaucetErrorCopy,
  serverMessage?: string | null,
): string {
  switch (code) {
    case "rate_limited":
      return copy.faucetErrRateLimited;
    case "faucet_busy":
      return copy.faucetErrBusy;
    case "daily_budget_exhausted":
      // The faucet's own sentence for this one is clear ("Faucet is empty for today").
      return serverMessage?.trim() || copy.faucetErrDailyBudget;
    default:
      return copy.faucetErrUnavailable;
  }
}
