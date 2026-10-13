export type FoundersHumanPassportConfig = {
  apiKey: string;
  scorerId: string;
  /** Minimum Passport score (defaults to scorer threshold or 20). */
  minScore: number;
};

function parseMinScore(raw: string | undefined): number {
  const trimmed = raw?.trim();
  if (!trimmed) return 20;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : 20;
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
