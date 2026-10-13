// api-cron.md M2: the icon quota counters moved from module-level Maps to Postgres, so these
// tests run against a PGlite stand-in for `@/db` (same pattern as wallet-vault-access-log).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/factory-icon-db-loader.mjs", import.meta.url);

const { getDbReady } = await import("./fixtures/factory-icon-pglite-db.mjs");
const { factoryIconDailyUsage } = await import("../src/db/schema.ts");
const {
  freeIconGensRemaining,
  consumeIconGenSlot,
  previewIconGenQuota,
  getWalletIconGenCountForDay,
  getGlobalIconGenCountForDay,
  utcDayKey,
} = await import("../src/lib/factory-icon-quota.ts");

const db = await getDbReady();

async function resetUsage() {
  await db.delete(factoryIconDailyUsage);
}

test("wallet gets three free icon generations per UTC day", async () => {
  await resetUsage();
  const wallet = "0x1111111111111111111111111111111111111111";
  const day = "2099-01-01";
  assert.equal(await freeIconGensRemaining(wallet, day, true), 3);
  for (let i = 0; i < 3; i++) {
    const decision = await previewIconGenQuota(wallet, day, true);
    assert.equal(decision.allowed, true);
    assert.equal(decision.charge, "free");
    await consumeIconGenSlot(wallet, "free", day);
  }
  assert.equal(await getWalletIconGenCountForDay(wallet, day), 3);
  assert.equal(await freeIconGensRemaining(wallet, day, true), 0);
  const after = await previewIconGenQuota(wallet, day, true);
  assert.equal(after.allowed, false);
  assert.equal(after.reason, "payment_required");
});

// M20-4: free generations are a verified-founder perk; everyone else must pay.
test("an ineligible wallet gets no free quota and is asked to pay", async () => {
  await resetUsage();
  const wallet = "0x2222222222222222222222222222222222222222";
  const day = "2099-01-02";
  assert.equal(await freeIconGensRemaining(wallet, day, false), 0);
  const decision = await previewIconGenQuota(wallet, day, false);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "payment_required");
});

test("eligibility is checked at both ends: an ineligible wallet with used slots stays ineligible", async () => {
  await resetUsage();
  const wallet = "0x3333333333333333333333333333333333333333";
  const day = "2099-01-03";
  await consumeIconGenSlot(wallet, "paid", day);
  assert.equal(await freeIconGensRemaining(wallet, day, false), 0);
  // The same wallet becomes eligible (e.g. verifies mid-day): the counter still governs.
  assert.equal(await freeIconGensRemaining(wallet, day, true), 2);
});

test("a freeEligible arg that is omitted fails closed to the paid path", async () => {
  await resetUsage();
  const wallet = "0x4444444444444444444444444444444444444444";
  const day = "2099-01-04";
  assert.equal(await freeIconGensRemaining(wallet, day), 0);
  assert.equal((await previewIconGenQuota(wallet, day)).reason, "payment_required");
});

// M2: one shared global row counts every wallet, so the daily cap is per-deployment, not
// per-instance (the old Map was multiplied by the number of warm Vercel instances).
test("consumeIconGenSlot increments a shared global counter alongside the wallet row", async () => {
  await resetUsage();
  const wallet = "0x5555555555555555555555555555555555555555";
  const day = "2099-01-05";
  assert.equal(await getGlobalIconGenCountForDay(day), 0);
  await consumeIconGenSlot(wallet, "free", day);
  await consumeIconGenSlot(wallet, "paid", day);
  assert.equal(await getGlobalIconGenCountForDay(day), 2);
  assert.equal(await getWalletIconGenCountForDay(wallet, day), 2);
});

test("wallets are counted separately and case-insensitively", async () => {
  await resetUsage();
  const day = "2099-01-06";
  await consumeIconGenSlot("0xAbCd00000000000000000000000000000000AbCd", "free", day);
  assert.equal(
    await getWalletIconGenCountForDay("0xabcd00000000000000000000000000000000abcd", day),
    1
  );
  assert.equal(await getWalletIconGenCountForDay("0x0000000000000000000000000000000000000001", day), 0);
});

test("utcDayKey uses ISO date", () => {
  const d = new Date("2026-10-01T23:59:00.000Z");
  assert.equal(utcDayKey(d), "2026-10-01");
});
