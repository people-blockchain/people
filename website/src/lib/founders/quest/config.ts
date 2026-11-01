import { utcDayKey } from "../config.ts";

export const QUEST_POINTS_CAP = 5_000;

/** Quest window ends 30 Nov 2026 23:59 UTC. */
export const QUEST_END_AT = Date.parse("2026-11-30T23:59:59.000Z");

export const QUEST_TELEGRAM_CHANNEL = "@people_blockchain";

export type QuestTaskType =
  | "verify"
  | "founder_card"
  | "telegram_join"
  | "x_engagement"
  | "x_daily"
  | "x_card_share"
  | "youtube_word"
  | "medium_word";

export const QUEST_TASK_POINTS: Record<QuestTaskType, number> = {
  verify: 1_000,
  founder_card: 500,
  telegram_join: 300,
  x_engagement: 300,
  x_daily: 100,
  x_card_share: 500,
  youtube_word: 200,
  medium_word: 100,
};

export function questSocialIdempotencyKey(network: string, userId: string, suffix?: string): string {
  const base = `social:${network}:${userId}`;
  return suffix ? `${base}:${suffix}` : base;
}

export function isQuestOpen(now = Date.now()): boolean {
  return now <= QUEST_END_AT;
}

export function questDayKey(date = new Date()): string {
  return utcDayKey(date);
}

export const SECRET_WORD_TTL_MS = 48 * 60 * 60 * 1000;

export function normalizeSecretWord(raw: string): string | null {
  const word = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (word.length < 2 || word.length > 64) return null;
  return word;
}

export function normalizeXHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) return null;
  return handle;
}

export function projectedQuestPpl(questPoints: number): number {
  return Math.min(questPoints, QUEST_POINTS_CAP);
}
