import { createHash } from "node:crypto";

/** @PeopleVerifyBot — phone verification for Million Founders. */
export const TELEGRAM_VERIFY_BOT_USERNAME = "PeopleVerifyBot";

export function readTelegramVerifyBotToken(): string | null {
  const token = process.env.TELEGRAM_VERIFY_BOT_TOKEN?.trim();
  return token || null;
}

/** First 32 hex chars of sha256(bot token); Telegram `secret_token` for setWebhook. */
export function telegramVerifyWebhookSecret(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

export function telegramVerifyDeepLink(startPayload: string): string {
  return `https://t.me/${TELEGRAM_VERIFY_BOT_USERNAME}?start=${encodeURIComponent(startPayload)}`;
}
