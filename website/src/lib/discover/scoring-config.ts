/**
 * Staged reach + weighted scoring for the project feed.
 * Adjust thresholds here; do not scatter magic numbers in handlers.
 */
export const DISCOVER_SCORING = {
  /** Audience caps per stage index (last stage = everyone). */
  stageAudienceSizes: [25, 100, 500, Number.POSITIVE_INFINITY] as const,
  /** After this many verified-human exposures at the current stage, evaluate promotion. */
  promotionMinExposures: 20,
  /** Weighted score needed to advance to the next circle. */
  promotionScoreThreshold: 12,
  /** Below this at evaluation time → author sees feedback and may revise. */
  weakScoreThreshold: 2,
  maxStageIndex: 3,
  /** Sort boost in the public feed when a card includes an optional video. */
  feedVideoRankBoost: 25,
  videoMinSeconds: 30,
  videoMaxSeconds: 60,
  weights: {
    voteInteresting: 1,
    voteUnclear: 0,
    voteNotInteresting: -2,
    follow: 8,
    question: 6,
    repeatVisit: 4,
    productClick: 10,
  },
  rateLimits: {
    reactionsPerUserPerHour: 40,
    questionsPerUserPerHour: 12,
    productClicksPerUserPerHour: 30,
    /** WEB-M2: project creation is the expensive one (external token lookup + a DB row per call). */
    projectsPerUserPerHour: 5,
    projectsPerUserPerDay: 20,
    /** A shared IP gets more headroom (offices/schools), but still an IP-wide ceiling. */
    projectsPerIpPerHour: 20,
  },
} as const;

export type DiscoverVote = "interesting" | "unclear" | "not_interesting";

export function stageAudienceCap(stageIndex: number): number {
  const sizes = DISCOVER_SCORING.stageAudienceSizes;
  const idx = Math.min(Math.max(stageIndex, 0), sizes.length - 1);
  return sizes[idx] ?? sizes[sizes.length - 1]!;
}
