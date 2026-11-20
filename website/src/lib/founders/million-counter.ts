import { FOUNDER_GOAL } from "./config";
import { FOUNDING_ROSTER_SIZE } from "../founding/contract";

export type MillionCounterSource = "hidden" | "verified";

export type MillionCounterPayload = {
  current?: number;
  goal: number;
  source: MillionCounterSource;
};

const HIDDEN: MillionCounterPayload = {
  goal: FOUNDING_ROSTER_SIZE,
  source: "hidden",
};

/**
 * The Founding 1,000 roster stays sealed until community stats are public AND
 * the verified wallet count has reached the lock-in. While sealed, public
 * endpoints must not reveal a live count, roster, or assigned order/number.
 */
export function isFoundingRosterSealed(input: {
  statsPublic: boolean;
  verifiedCount: number | null;
}): boolean {
  if (!input.statsPublic) return true;
  const count = input.verifiedCount;
  return count == null || !Number.isFinite(count) || count < FOUNDING_ROSTER_SIZE;
}

/**
 * Public `/api/founders/million-counter` payload.
 *
 * Live `current` is returned only when the roster is unsealed. Until then
 * the response is `{ goal: 1000, source: "hidden" }` with no `current`.
 */
export function resolveMillionCounterPayload(input: {
  statsPublic: boolean;
  verifiedCount: number | null;
}): MillionCounterPayload {
  if (isFoundingRosterSealed(input)) return { ...HIDDEN };
  return {
    current: input.verifiedCount as number,
    goal: FOUNDER_GOAL,
    source: "verified",
  };
}
