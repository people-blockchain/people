import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let db;
let schema;
let coldStart;
let verifyWebhook;
let startCode;
let waitlist;
let simulator;
let foundingCopyMod;
let partnerCommission;
let analyticsValidate;
let analyticsCatalog;

before(async () => {
  process.env.FOUNDERS_PHONE_HASH_SALT = "test-founding-1000-phone-salt";
  process.env.TELEGRAM_VERIFY_BOT_TOKEN = "123456:TEST_BOT_TOKEN_FOUNDING_1000";
  const pglite = await import("./fixtures/referral-pglite-db.mjs");
  globalThis.__getDb = pglite.getDbReady;
  db = await pglite.getDbReady();
  await db.$client.exec(
    readFileSync(join(root, "drizzle/0010_founder_telegram_verify.sql"), "utf8"),
  );
  await db.$client.exec(
    readFileSync(join(root, "drizzle/0016_bug_reports_telegram.sql"), "utf8")
      .split(";")
      .find((s) => s.includes("telegram_bot_state")),
  );
  schema = await import("../src/db/schema.ts");
  coldStart = await import("../src/lib/founders/telegram-cold-start.ts");
  verifyWebhook = await import("../src/lib/founders/telegram-verify-webhook.ts");
  startCode = await import("../src/lib/founders/telegram-start-code.ts");
  waitlist = await import("../src/lib/founding/waitlist.ts");
  simulator = await import("../src/lib/founding/simulator.ts");
  foundingCopyMod = await import("../src/lib/founding/copy.ts");
  partnerCommission = await import("../src/lib/partner/commission.ts");
  analyticsValidate = await import("../src/lib/analytics/validate.ts");
  analyticsCatalog = await import("../src/lib/analytics/events-catalog.ts");
});

test("Simulator math: curve entry index rises monotonically and Season 1 pool share is exact", () => {
  const start = simulator.simulateCurveEntry(0);
  const early = simulator.simulateCurveEntry(15);
  const mid = simulator.simulateCurveEntry(50);
  const end = simulator.simulateCurveEntry(100);

  assert.equal(start.entryProgressPct, 0);
  assert.equal(start.soldPplAtEntry, 0);
  assert.ok(Math.abs(start.priceIndexMultiple - 1) < 1e-9);
  assert.ok(Math.abs(start.relativePplPerDollarPct - 100) < 1e-9);

  assert.ok(early.priceIndexMultiple > start.priceIndexMultiple);
  assert.ok(mid.priceIndexMultiple > early.priceIndexMultiple);
  assert.ok(end.priceIndexMultiple > mid.priceIndexMultiple);
  assert.ok(Math.abs(end.priceIndexMultiple - 50) < 1e-6);

  assert.ok(early.relativePplPerDollarPct < start.relativePplPerDollarPct);
  assert.ok(mid.relativePplPerDollarPct < early.relativePplPerDollarPct);
  assert.ok(end.relativePplPerDollarPct < mid.relativePplPerDollarPct);

  // Out-of-bounds clamping
  assert.equal(simulator.simulateCurveEntry(-25).entryProgressPct, 0);
  assert.equal(simulator.simulateCurveEntry(250).entryProgressPct, 100);

  // Pool share: your points / total points * 6,000,000 PPL
  const share = simulator.simulateSeason1PoolShare(2_500, 2_500_000);
  assert.equal(share.poolPpl, 6_000_000);
  assert.ok(Math.abs(share.shareRatio - 0.001) < 1e-12);
  assert.ok(Math.abs(share.estimatedPoolSharePpl - 6_000) < 1e-6);

  // Zero / negative / userPoints > totalPoints edge cases
  assert.equal(simulator.simulateSeason1PoolShare(0, 1_000_000).estimatedPoolSharePpl, 0);
  assert.equal(simulator.simulateSeason1PoolShare(-500, 1_000_000).estimatedPoolSharePpl, 0);
  const capped = simulator.simulateSeason1PoolShare(5_000_000, 100_000);
  assert.equal(capped.totalPoints, 5_000_000);
  assert.equal(capped.shareRatio, 1);
  assert.equal(capped.estimatedPoolSharePpl, 6_000_000);
});

test("Telegram cold-start claim flow: token hash at rest, phone/TG uniqueness, expiry, and single-use redemption", async () => {
  coldStart.resetTelegramColdStartMemoryForTests();

  const created = await coldStart.createPendingTelegramClaim({
    phoneE164: "+14155550101",
    telegramUserId: "700101",
    chatId: "700101",
    locale: "en",
    referredByCode: "inviter01",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  // Token format & hash at rest verification
  assert.match(created.token, /^[A-Za-z0-9_-]{32,64}$/);
  assert.equal(created.tokenHash, coldStart.hashTelegramClaimToken(created.token));
  assert.notEqual(created.token, created.tokenHash);
  assert.match(created.claimUrl, /https:\/\/www\.peopleblockchain\.network\/founders\?tg_claim=/);
  assert.match(created.referralUrl, /https:\/\/www\.peopleblockchain\.network\/founders\?ref=f1k/);

  const [dbRow] = await db
    .select()
    .from(schema.founderTelegramPendingClaims)
    .where(eq(schema.founderTelegramPendingClaims.tokenHash, created.tokenHash));
  assert.ok(dbRow, "pending claim row stored in DB");
  assert.equal(dbRow.tokenHash, created.tokenHash);

  // Uniqueness: another Telegram account cannot claim the same phone
  const dupPhone = await coldStart.createPendingTelegramClaim({
    phoneE164: "+1 (415) 555-0101",
    telegramUserId: "700999",
    chatId: "700999",
    locale: "en",
  });
  assert.deepEqual(dupPhone, { ok: false, error: "phone_taken" });

  // Uniqueness: same Telegram account cannot claim a different phone
  const dupTg = await coldStart.createPendingTelegramClaim({
    phoneE164: "+14155550102",
    telegramUserId: "700101",
    chatId: "700101",
    locale: "en",
  });
  assert.deepEqual(dupTg, { ok: false, error: "telegram_taken" });

  // Inspect before redemption
  const inspected = await coldStart.inspectPendingTelegramClaim(created.token);
  assert.equal(inspected.ok, true);

  // Expiry check: token created with -1000ms TTL is rejected as expired_token
  const expiredClaim = await coldStart.createPendingTelegramClaim({
    phoneE164: "+14155550199",
    telegramUserId: "700199",
    chatId: "700199",
    ttlMs: -1_000,
  });
  assert.equal(expiredClaim.ok, true);
  if (expiredClaim.ok) {
    const expiredInspect = await coldStart.inspectPendingTelegramClaim(expiredClaim.token);
    assert.deepEqual(expiredInspect, { ok: false, error: "expired_token" });
  }

  // Create a user with a linked wallet and redeem the single-use claim token
  const userId = crypto.randomUUID();
  const wallet = "0x7777777777777777777777777777777777777777";
  await db.insert(schema.users).values({ id: userId, email: "coldstart@example.com" });
  await db.insert(schema.partners).values({
    userId,
    referralCode: "coldref01",
    walletAddress: wallet,
    walletBoundAt: new Date(),
  });

  const redeemed = await coldStart.redeemPendingTelegramClaim({
    token: created.token,
    userId,
    countryCode: "US",
    deviceId: "device-cold-start-test-0001",
    ip: "203.0.113.55",
  });
  assert.equal(redeemed.ok, true);
  if (redeemed.ok) {
    assert.equal(redeemed.status, "sealed");
    assert.equal(redeemed.verificationLevel, 1);
    assert.ok(redeemed.founder);
    assert.equal(redeemed.founder.verificationLevel, 1);
  }

  // Single-use enforcement: second redemption of the same token fails with already_claimed
  const secondRedeem = await coldStart.redeemPendingTelegramClaim({
    token: created.token,
    userId,
  });
  assert.deepEqual(secondRedeem, { ok: false, error: "already_claimed" });

  // Phone is now permanently in founderPhoneRegistry, so a new cold-start with it fails
  const afterSealAttempt = await coldStart.createPendingTelegramClaim({
    phoneE164: "+14155550101",
    telegramUserId: "700101",
    chatId: "700101",
  });
  assert.deepEqual(afterSealAttempt, { ok: false, error: "phone_taken" });
});

test("Telegram webhook supports both cold-start `/start f1000_en` and backward-compatible session-code flow", async () => {
  const sentMessages = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.telegram.org")) {
      sentMessages.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    }
    return origFetch(url, init);
  };

  try {
    // 1. Cold-start flow without wallet: `/start f1000_en` -> contact -> pending claim link
    await verifyWebhook.handleTelegramVerifyUpdate({
      message: {
        chat: { id: 910001 },
        from: { id: 910001, language_code: "en" },
        text: "/start f1000_en",
      },
    });
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /Share phone number/);

    await verifyWebhook.handleTelegramVerifyUpdate({
      message: {
        chat: { id: 910001 },
        from: { id: 910001, language_code: "en" },
        contact: { phone_number: "+14155550222", user_id: 910001 },
      },
    });
    assert.equal(sentMessages.length, 2);
    assert.match(sentMessages[1].text, /Pending in Founding 1,000 Vault/);
    assert.match(sentMessages[1].text, /founders\?tg_claim=/);
    assert.match(sentMessages[1].text, /founders\?ref=f1k/);

    // 2. Invalid non-cold-start session code still returns invalidLink
    await verifyWebhook.handleTelegramVerifyUpdate({
      message: {
        chat: { id: 910002 },
        from: { id: 910002, language_code: "en" },
        text: "/start invalid_session_code_999",
      },
    });
    assert.equal(sentMessages.length, 3);
    assert.match(sentMessages[2].text, /invalid or expired/i);

    // 3. Backward-compatible session-code flow for an already signed-in founder
    const existingUserId = crypto.randomUUID();
    await db.insert(schema.users).values({ id: existingUserId, email: "sessionflow@example.com" });
    await db.insert(schema.founders).values({
      userId: existingUserId,
      founderNumber: 777,
      countryCode: "DE",
      entryMultiplier: 5,
      totalPoints: 0,
      walletAddress: "0x8888888888888888888888888888888888888888",
      verificationLevel: 0,
    });
    const code = await startCode.createFounderTelegramStartCode(existingUserId);

    await verifyWebhook.handleTelegramVerifyUpdate({
      message: {
        chat: { id: 910003 },
        from: { id: 910003, language_code: "en" },
        text: `/start ${code}_en`,
      },
    });
    assert.equal(sentMessages.length, 4);
    assert.match(sentMessages[3].text, /Share phone number/);

    await verifyWebhook.handleTelegramVerifyUpdate({
      message: {
        chat: { id: 910003 },
        from: { id: 910003, language_code: "en" },
        contact: { phone_number: "+14155550333", user_id: 910003 },
      },
    });
    assert.equal(sentMessages.length, 5);
    assert.match(sentMessages[4].text, /Telegram verification recorded/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Waitlist validation & dedup: rejects malformed addresses and deduplicates without data leak", async () => {
  assert.equal(waitlist.normalizeAndValidateWaitlistEmail("  Alice@Example.COM "), "alice@example.com");
  assert.equal(waitlist.normalizeAndValidateWaitlistEmail(""), null);
  assert.equal(waitlist.normalizeAndValidateWaitlistEmail("not-an-email"), null);
  assert.equal(waitlist.normalizeAndValidateWaitlistEmail("bad@domain"), null);
  assert.equal(waitlist.normalizeAndValidateWaitlistEmail("evil@example.com\r\nBcc:a@b.c"), null);
  assert.equal(waitlist.normalizeAndValidateWaitlistEmail("<script>@example.com"), null);

  const first = await waitlist.submitFoundingWaitlistEmail({
    email: "FounderOne@Example.com",
    locale: "es",
    path: "/docs",
    ref: "alicekol1",
    ip: "198.51.100.10",
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.status, "registered");
  assert.equal(first.botUrl, "https://t.me/PeopleVerifyBot?start=f1000_es_alicekol1");

  // Duplicate submission returns the exact same generic shape (no enumeration leak)
  const second = await waitlist.submitFoundingWaitlistEmail({
    email: "founderone@example.com",
    locale: "es",
    path: "/roadmap",
    ref: "alicekol1",
    ip: "198.51.100.10",
  });
  assert.deepEqual(second, first);

  const rows = await db
    .select()
    .from(schema.founderEmailWaitlist)
    .where(eq(schema.founderEmailWaitlist.emailNormalized, "founderone@example.com"));
  assert.equal(rows.length, 1);
});

test("/partner single 7% USDC rule and Founding 1,000 localization / analytics catalog invariants", () => {
  // Single 7% USDC from the very first purchase, no minimum volume
  for (const usd of [0n, 100n, 25_000n, 100_000n, 500_000n]) {
    const tier = partnerCommission.resolveKolTier(usd * partnerCommission.MICRO_PER_UNIT);
    assert.equal(tier.usdcRateBps, 700);
    assert.equal(tier.pplRateBps, 300);
  }

  // Russian founding copy is Cyrillic; other non-English locales stay in their own script.
  const langs = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar", "ru"];
  const noCyrillic = new Set(["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"]);
  for (const lang of langs) {
    const c = foundingCopyMod.foundingCopy(lang);
    assert.ok(c.stickyBar.messageFull.includes("PEOPLE Mainnet Beta"), `${lang} stickyBar Mainnet Beta`);
    assert.ok(
      c.stickyBar.messageFull.length <= 110,
      `${lang} stickyBar.messageFull is too long for the desktop top bar (${c.stickyBar.messageFull.length} chars)`,
    );
    assert.ok(c.modal.rewardNote.length > 5, `${lang} rewardNote`);
    assert.ok(c.simulator.poolFormulaLabel.includes("6,000,000") || c.simulator.poolFormulaLabel.includes("6.000.000") || c.simulator.poolFormulaLabel.includes("6 000 000"), `${lang} pool formula`);
    if (lang === "ru") {
      assert.match(JSON.stringify(c), /[Ѐ-ӿ]/, "ru founding copy must contain Cyrillic");
    } else if (noCyrillic.has(lang)) {
      assert.doesNotMatch(JSON.stringify(c), /[Ѐ-ӿ]/, `${lang} founding copy must not contain Cyrillic`);
    }
    if (lang !== "en") {
      assert.notEqual(c.progress.verifyShort, "Verify", `${lang} verifyShort`);
      assert.notEqual(c.progress.detailsToggle, "Details", `${lang} detailsToggle`);
      assert.notEqual(c.stickyBar.ctaShort, "Claim Seat", `${lang} ctaShort`);
    }
  }

  // All 10 Founding 1,000 conversion analytics events are cataloged and accepted by parseTrackPayload
  const expectedEvents = [
    "sticky_bar_click",
    "scroll_drawer_show",
    "scroll_drawer_click",
    "exit_intent_show",
    "email_waitlist_submit",
    "tg_deeplink_click",
    "tg_verified_pending",
    "wallet_sealed_1000",
    "passport_completed",
    "simulator_interact",
  ];
  for (const name of expectedEvents) {
    assert.ok(analyticsCatalog.ALL_TRACKED_EVENT_NAMES.includes(name), `missing ${name} in ALL_TRACKED_EVENT_NAMES`);
    const parsed = analyticsValidate.parseTrackPayload({
      sid: "0123456789abcdef",
      events: [{ type: "custom", name, path: "/founders", props: { source: "test" } }],
    });
    assert.equal(parsed.ok, true, `parseTrackPayload failed for ${name}`);
  }

  // Bootstrap DDL mirrors drizzle/0027_founding_traps_tg_claim_waitlist.sql
  const sqlRaw = readFileSync(
    join(root, "drizzle/0027_founding_traps_tg_claim_waitlist.sql"),
    "utf8",
  );
  assert.match(sqlRaw, /CREATE TABLE IF NOT EXISTS "founder_telegram_pending_claim"/);
  assert.match(sqlRaw, /CREATE TABLE IF NOT EXISTS "founder_email_waitlist"/);

  const layoutSrc = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
  const keywordsBlock = layoutSrc.match(/keywords:\s*\[([\s\S]*?)\]/);
  assert.ok(keywordsBlock, "layout metadata keywords block missing");
  assert.doesNotMatch(keywordsBlock[1], /[Ѐ-ӿ]/, "public metadata keywords must not contain Cyrillic");
});
