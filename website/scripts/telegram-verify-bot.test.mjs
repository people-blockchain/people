import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  telegramVerifyWebhookSecret,
  TELEGRAM_VERIFY_BOT_USERNAME,
} from "../src/lib/founders/telegram-bot.ts";

test("webhook secret is first 32 hex chars of sha256(token)", () => {
  const token = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz";
  const expected = createHash("sha256").update(token).digest("hex").slice(0, 32);
  assert.equal(telegramVerifyWebhookSecret(token), expected);
  assert.equal(expected.length, 32);
});

test("bot username is PeopleVerifyBot", () => {
  assert.equal(TELEGRAM_VERIFY_BOT_USERNAME, "PeopleVerifyBot");
});
