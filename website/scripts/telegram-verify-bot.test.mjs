import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  telegramVerifyWebhookSecret,
  TELEGRAM_VERIFY_BOT_USERNAME,
} from "../src/lib/founders/telegram-bot.ts";
import {
  FOUNDING_TELEGRAM_BOT_USERNAME,
  parseColdStartPayload,
  telegramColdStartLink,
} from "../src/lib/founding/contract.ts";

test("webhook secret is first 32 hex chars of sha256(token)", () => {
  const token = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz";
  const expected = createHash("sha256").update(token).digest("hex").slice(0, 32);
  assert.equal(telegramVerifyWebhookSecret(token), expected);
  assert.equal(expected.length, 32);
});

test("bot username is PeopleVerifyBot across session and cold-start flows", () => {
  assert.equal(TELEGRAM_VERIFY_BOT_USERNAME, "PeopleVerifyBot");
  assert.equal(FOUNDING_TELEGRAM_BOT_USERNAME, "PeopleVerifyBot");
  assert.equal(
    telegramColdStartLink("es", "alicekol1"),
    "https://t.me/PeopleVerifyBot?start=f1000_es_alicekol1",
  );
  assert.deepEqual(parseColdStartPayload("f1000_es_alicekol1"), {
    locale: "es",
    ref: "alicekol1",
  });
  assert.equal(parseColdStartPayload("random_session_code_123456"), null);
});
