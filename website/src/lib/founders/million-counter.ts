import { FOUNDER_GOAL } from "@/lib/founders/config";
import { FOUNDING_ROSTER_SIZE } from "@/lib/founding/contract";

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
 * Public `/api/founders/million-counter` payload.
 *
 * Live `current` is returned only when community stats are public AND the
 * verified wallet count has reached the Founding 1,000 lock-in. Until then
 * the response is `{ goal: 1000, source: "hidden" }` with no `current`.
 */
export function resolveMillionCounterPayload(input: {
  statsPublic: boolean;
  verifiedCount: number | null;
}): MillionCounterPayload {
  if (!input.statsPublic) return { ...HIDDEN };
  const count = input.verifiedCount;
  if (count == null || !Number.isFinite(count) || count < FOUNDING_ROSTER_SIZE) {
    return { ...HIDDEN };
  }
  return {
    current: count,
    goal: FOUNDER_GOAL,
    source: "verified",
  };
}
