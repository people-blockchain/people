export type FoundersHumanPassportConfig = {
  apiKey: string;
  scorerId: string;
  /** Minimum Passport score; the site decides, not the scorer. Defaults to 10. */
  minScore: number;
};

/**
 * 10, not Passport's recommended 20: free account stamps (GitHub, Discord, Steam, ZK Email,
 * LinkedIn, Google, phone) add up to ~19 at most, so 20 shut out people without crypto history
 * or money. Owner decision, 2026-11-01. Override with FOUNDERS_HUMAN_PASSPORT_MIN_SCORE.
 */
export const HUMAN_PASSPORT_DEFAULT_MIN_SCORE = 10;

function parseMinScore(raw: string | undefined): number {
  const trimmed = raw?.trim();
  if (!trimmed) return HUMAN_PASSPORT_DEFAULT_MIN_SCORE;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : HUMAN_PASSPORT_DEFAULT_MIN_SCORE;
}

/** Stamps API v2 — keys from https://developer.passport.xyz */
export function readFoundersHumanPassportConfig(): FoundersHumanPassportConfig | null {
  const apiKey = process.env.FOUNDERS_HUMAN_PASSPORT_API_KEY?.trim();
  const scorerId = process.env.FOUNDERS_HUMAN_PASSPORT_SCORER_ID?.trim();
  if (!apiKey || !scorerId) return null;
  return {
    apiKey,
    scorerId,
    minScore: parseMinScore(process.env.FOUNDERS_HUMAN_PASSPORT_MIN_SCORE),
  };
}
