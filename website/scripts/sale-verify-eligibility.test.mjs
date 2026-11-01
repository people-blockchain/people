import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  decideSaleEligibility,
  hashIdentifier,
  saleRequiresHumanPassport,
} from "../src/lib/sale/eligibility.ts";

const PERSON = "person-a";
const OTHER_PERSON = "person-b";
const ACCOUNT = "0x1111111111111111111111111111111111111111";
const OTHER_ACCOUNT = "0x2222222222222222222222222222222222222222";

process.env.SALE_ID_HMAC_SECRET = "test-id-hmac-secret";

function decide(overrides = {}) {
  return decideSaleEligibility({
    hasTelegramPhone: false,
    hpScore: null,
    hpThreshold: 20,
    identifierHashes: [],
    existingBindings: new Map(),
    requestedAccount: ACCOUNT,
    personKey: PERSON,
    ...overrides,
  });
}

test("telegram phone verified is eligible", () => {
  const decision = decide({
    hasTelegramPhone: true,
    identifierHashes: [
      hashIdentifier("tg", "123456"),
      hashIdentifier("phone", "phone-hash"),
    ],
  });
  assert.deepEqual(decision, { ok: true });
});

test("Human Passport score at the threshold is eligible", () => {
  const decision = decide({
    hpScore: 20,
    hpThreshold: 20,
    identifierHashes: [hashIdentifier("hp_wallet", ACCOUNT)],
  });
  assert.deepEqual(decision, { ok: true });
});

test("neither telegram phone nor HP is not eligible", () => {
  const decision = decide();
  assert.deepEqual(decision, { ok: false, reason: "not_eligible" });
});

test("tg/phone identifiers without verified telegram phone are not eligible", () => {
  const decision = decide({
    identifierHashes: [
      hashIdentifier("tg", "123456"),
      hashIdentifier("phone", "phone-hash"),
    ],
  });
  assert.deepEqual(decision, { ok: false, reason: "not_eligible" });
});

test("Human Passport score below the threshold is denied", () => {
  const decision = decide({
    hpScore: 19.9,
    hpThreshold: 20,
    identifierHashes: [hashIdentifier("hp_wallet", ACCOUNT)],
  });
  assert.deepEqual(decision, { ok: false, reason: "not_eligible" });
});

test("an identifier owned by another person is denied", () => {
  const tgHash = hashIdentifier("tg", "123456");
  const decision = decide({
    hasTelegramPhone: true,
    identifierHashes: [tgHash],
    existingBindings: new Map([
      [tgHash, { personKey: OTHER_PERSON, account: OTHER_ACCOUNT }],
    ]),
  });
  assert.deepEqual(decision, { ok: false, reason: "identifier_bound_elsewhere" });
});

test("a requested account bound elsewhere is denied", () => {
  const decision = decide({
    hasTelegramPhone: true,
    identifierHashes: [hashIdentifier("hp_wallet", ACCOUNT)],
    existingBindings: new Map([
      ["some-other-hash", { personKey: OTHER_PERSON, account: ACCOUNT }],
    ]),
  });
  assert.deepEqual(decision, { ok: false, reason: "account_bound_elsewhere" });
});

test("the same person cannot reuse the same identifiers for a different account", () => {
  const tgHash = hashIdentifier("tg", "123456");
  const decision = decide({
    hasTelegramPhone: true,
    identifierHashes: [tgHash],
    existingBindings: new Map([
      [tgHash, { personKey: PERSON, account: OTHER_ACCOUNT }],
    ]),
  });
  assert.deepEqual(decision, { ok: false, reason: "account_bound_elsewhere" });
});

test("identifier hashes are deterministic HMAC values, never the raw identifier", () => {
  const value = "123456";
  const first = hashIdentifier("tg", value);
  const second = hashIdentifier("tg", value);
  const expected = createHmac("sha256", process.env.SALE_ID_HMAC_SECRET)
    .update(`tg:${value}`)
    .digest("hex");

  assert.equal(first, second);
  assert.equal(first, expected);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.ok(!first.includes(value));
});

test("wallet identifier hashing normalizes case but stays deterministic", () => {
  const lower = hashIdentifier("hp_wallet", ACCOUNT);
  const upper = hashIdentifier("hp_wallet", `0x${"A".repeat(40)}`);
  const mixed = hashIdentifier("hp_wallet", "0x1111111111111111111111111111111111111111");
  assert.equal(lower, mixed);
  assert.notEqual(lower, upper);
});

test("bot-wave switch: with SALE_REQUIRE_HUMAN_PASSPORT, Telegram phone alone is not enough", () => {
  assert.deepEqual(decide({ hasTelegramPhone: true, requireHumanPassport: true }), { ok: false, reason: "not_eligible" });
  assert.deepEqual(decide({ hasTelegramPhone: true, hpScore: 25, hpThreshold: 20, requireHumanPassport: true }), { ok: true });
  assert.deepEqual(decide({ hasTelegramPhone: true, requireHumanPassport: false }), { ok: true });
  assert.equal(saleRequiresHumanPassport({}), false);
  assert.equal(saleRequiresHumanPassport({ SALE_REQUIRE_HUMAN_PASSPORT: "1" }), true);
  assert.equal(saleRequiresHumanPassport({ SALE_REQUIRE_HUMAN_PASSPORT: "true" }), true);
  assert.equal(saleRequiresHumanPassport({ SALE_REQUIRE_HUMAN_PASSPORT: "0" }), false);
});
