import { test } from "node:test";
import assert from "node:assert/strict";
import { FOUNDER_GOAL } from "../src/lib/founders/config.ts";
import {
  aggregateVerifiedFounders,
  emptyFounderMapStats,
  isVerifiedFounderForMap,
} from "../src/lib/founders/map-aggregate.ts";
import { VERIFICATION_LEVEL_TELEGRAM_PHONE } from "../src/lib/founders/verification.ts";

const verifiedRow = (overrides = {}) => ({
  countryCode: "US",
  verificationLevel: VERIFICATION_LEVEL_TELEGRAM_PHONE,
  verifiedAt: "2026-01-01T00:00:00.000Z",
  isBot: false,
  walletAddress: "0xdeadbeef",
  userId: "user-secret",
  founderNumber: 7,
  ...overrides,
});

test("isVerifiedFounderForMap rejects bots, missing verification, and low tiers", () => {
  assert.equal(isVerifiedFounderForMap(verifiedRow()), true);
  assert.equal(isVerifiedFounderForMap(verifiedRow({ isBot: true })), false);
  assert.equal(isVerifiedFounderForMap(verifiedRow({ verifiedAt: null })), false);
  assert.equal(isVerifiedFounderForMap(verifiedRow({ verificationLevel: 0 })), false);
});

test("aggregateVerifiedFounders groups by self-declared ISO country only", () => {
  const stats = aggregateVerifiedFounders([
    verifiedRow({ countryCode: "ge" }),
    verifiedRow({ countryCode: "GE" }),
    verifiedRow({ countryCode: "US" }),
    verifiedRow({ countryCode: "US", walletAddress: "0x2" }),
    verifiedRow({ countryCode: "DE", verifiedAt: null }),
    verifiedRow({ countryCode: "FR", isBot: true }),
  ]);

  assert.equal(stats.goal, FOUNDER_GOAL);
  assert.equal(stats.verifiedCount, 4);
  assert.deepEqual(stats.byCountry, { GE: 2, US: 2 });
  assert.deepEqual(stats.countries, [
    { countryCode: "GE", count: 2 },
    { countryCode: "US", count: 2 },
  ]);
});

test("aggregateVerifiedFounders keeps single-founder countries and skips invalid codes", () => {
  const stats = aggregateVerifiedFounders([verifiedRow({ countryCode: "MC", founderNumber: 1 })]);
  assert.equal(stats.verifiedCount, 1);
  assert.deepEqual(stats.countries, [{ countryCode: "MC", count: 1 }]);
  assert.equal(aggregateVerifiedFounders([verifiedRow({ countryCode: "USA" })]).verifiedCount, 0);
});

test("public map stats never include personal fields", () => {
  const stats = aggregateVerifiedFounders([verifiedRow()]);
  const serialized = JSON.stringify(stats);
  assert.doesNotMatch(serialized, /walletAddress|userId|founderNumber|phoneHash/i);
  assert.deepEqual(Object.keys(stats).sort(), ["byCountry", "countries", "goal", "verifiedCount"]);
  for (const item of stats.countries) {
    assert.deepEqual(Object.keys(item).sort(), ["count", "countryCode"]);
  }
});

test("emptyFounderMapStats is honest zeros", () => {
  assert.deepEqual(emptyFounderMapStats(), {
    verifiedCount: 0,
    goal: FOUNDER_GOAL,
    countries: [],
    byCountry: {},
  });
});
