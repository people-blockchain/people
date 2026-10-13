#!/usr/bin/env node
/**
 * Register @PeopleVerifyBot webhook on production.
 *
 * Requires TELEGRAM_VERIFY_BOT_TOKEN in the environment (same as Vercel server env).
 *
 *   export TELEGRAM_VERIFY_BOT_TOKEN='…'
 *   node scripts/telegram-set-webhook.mjs
 *
 * Webhook URL: https://www.peopleblockchain.network/api/telegram/verify-webhook
 * secret_token: first 32 hex chars of sha256(bot token) — derived in code, not a separate env var.
 */
import { createHash } from "node:crypto";

const WEBHOOK_URL = "https://www.peopleblockchain.network/api/telegram/verify-webhook";

const token = process.env.TELEGRAM_VERIFY_BOT_TOKEN?.trim();
if (!token) {
  console.error("TELEGRAM_VERIFY_BOT_TOKEN is not set");
  process.exit(1);
}

const secretToken = createHash("sha256").update(token).digest("hex").slice(0, 32);

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: WEBHOOK_URL,
    secret_token: secretToken,
    allowed_updates: ["message"],
  }),
});

const body = await res.json();
if (!body.ok) {
  console.error("setWebhook failed:", body);
  process.exit(1);
}
console.log("Webhook set:", WEBHOOK_URL);
console.log("secret_token (X-Telegram-Bot-Api-Secret-Token):", secretToken);
