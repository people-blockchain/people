/**
 * Pure decision logic for the /founders auto-claim flow: after sign-in the page issues the
 * founder number by itself (the API contract is unchanged — it is the same
 * `POST /api/founders/register`). Kept out of the component so the "claim once" rules are
 * unit-tested without a browser.
 */

export type AutoClaimDecision = "idle" | "waiting" | "claim" | "done" | "error";

export type AutoClaimInput = {
  /** Signed in to People (NextAuth session). */
  signedIn: boolean;
  /** Proof-of-humanity gate met: a wallet is linked. `register` refuses without it. */
  verifiedHuman: boolean;
  /** A founder number already exists — never claim again. */
  hasFounder: boolean;
  /** The country guess is ready (detection is client-only, so it lands one tick after mount). */
  countryReady: boolean;
  /** A claim was already fired for this page load. */
  attempted: boolean;
  /** The last claim attempt failed; the UI must show the error and a retry. */
  failed: boolean;
};

/**
 * - `idle`    — nobody to sign in as yet.
 * - `waiting` — signed in, but a precondition is not ready yet (wallet link / country guess).
 * - `claim`   — fire the claim now (once).
 * - `done`    — a founder number exists, or the claim already went through.
 * - `error`   — the claim failed; surface it with a retry.
 */
export function decideAutoClaim(input: AutoClaimInput): AutoClaimDecision {
  if (input.hasFounder) return "done";
  if (!input.signedIn) return "idle";
  if (input.attempted) return input.failed ? "error" : "done";
  if (!input.verifiedHuman) return "waiting";
  if (!input.countryReady) return "waiting";
  return "claim";
}

/**
 * `register` answers 409 `already_registered` when the number was issued by an earlier request
 * (double mount, a previous visit). That is a success for an idempotent auto-claim: reload and
 * show the personal block instead of an error.
 */
export function isIdempotentClaimSuccess(error: string | null | undefined): boolean {
  return error === "already_registered";
}
