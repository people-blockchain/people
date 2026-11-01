import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { keccak256, toBytes } from "viem";

import {
  PENDING_PAYOUT_STORAGE_SLOT,
  forgetPending,
  newBurnAllowed,
  readPendingPayouts,
  reconcilePending,
  rememberPending,
} from "../src/lib/sale/v2/pending-payout.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
const ACCOUNT = "0x1111111111111111111111111111111111111111";
const SELLER = ACCOUNT;
const HUB = "0x3333333333333333333333333333333333333333";
const RETURN_ID = keccak256(toBytes("pending-return"));
const BURN_TX = `0x${"ab".repeat(32)}`;
const PERSON = keccak256(toBytes("person-1"));

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

function pending(overrides = {}) {
  return {
    returnId: RETURN_ID,
    amount: "1000000000000000000",
    burnTx: BURN_TX,
    status: "pending",
    account: ACCOUNT,
    seller: SELLER,
    hub: HUB,
    personId: PERSON,
    destChainId: 8453,
    ...overrides,
  };
}

test("a pending sale payout is stored and still there after the tab state is gone", () => {
  const storage = memoryStorage();
  assert.deepEqual(readPendingPayouts(storage), []);
  rememberPending(storage, pending());
  const closed = memoryStorage();
  closed.setItem(PENDING_PAYOUT_STORAGE_SLOT, storage.getItem(PENDING_PAYOUT_STORAGE_SLOT));
  const loaded = readPendingPayouts(closed);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].returnId, RETURN_ID);
  assert.equal(loaded[0].amount, "1000000000000000000");
  assert.equal(loaded[0].burnTx, BURN_TX);
  assert.equal(loaded[0].status, "pending");
});

test("a closed tab recovers an unpaid burn from chain state and drops a paid one", () => {
  const storage = memoryStorage();
  const amount = 1000n;
  const recovered = reconcilePending([], [
    {
      returnId: RETURN_ID,
      claimedPpl: 400n,
      used: false,
      amount,
      burnTx: BURN_TX,
      account: ACCOUNT,
      seller: SELLER,
      hub: HUB,
      personId: PERSON,
      destChainId: 8453,
    },
  ]);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].amount, "1000");
  assert.equal(recovered[0].burnTx, BURN_TX);
  assert.equal(recovered[0].status, "pending");

  rememberPending(storage, recovered[0]);
  const paid = reconcilePending(readPendingPayouts(storage), [
    { returnId: RETURN_ID, claimedPpl: amount, used: true, amount },
  ]);
  assert.equal(paid.length, 0);
  forgetPending(storage, RETURN_ID);
  assert.equal(readPendingPayouts(storage).length, 0);
});

test("a new burn is blocked while a payout is pending unless the seller confirms", () => {
  assert.equal(newBurnAllowed(1, false), false);
  assert.equal(newBurnAllowed(2, false), false);
  assert.equal(newBurnAllowed(1, true), true);
  assert.equal(newBurnAllowed(0, false), true);
});

test("pending payout copy is in all 12 locales and talks about selling", () => {
  const panel = readFileSync(join(root, "src/components/buy/v2/SellBackPanel.tsx"), "utf8");
  assert.match(panel, /data-testid="v2-pending-payouts"/);
  assert.match(panel, /data-testid="v2-continue-payout"/);
  assert.match(panel, /newBurnAllowed/);
  const keys = ["pendingTitle", "pendingBody", "continuePayout", "confirmAnotherSale"];
  for (const lang of LANGS) {
    const sellBack = JSON.parse(readFileSync(join(root, `src/lib/locales/surfaces/buy-${lang}.json`), "utf8")).v2.sellBack;
    for (const key of keys) {
      assert.equal(typeof sellBack[key], "string", `${lang} ${key}`);
      assert.ok(sellBack[key].length > 3, `${lang} ${key}`);
      assert.doesNotMatch(sellBack[key], /\breturn\b|\brefund\b|возврат|استرداد|退款/i, `${lang} ${key}`);
    }
  }
  assert.match(JSON.parse(readFileSync(join(root, "src/lib/locales/surfaces/buy-en.json"), "utf8")).v2.sellBack.confirmAnotherSale, /Sell/);
  assert.match(JSON.parse(readFileSync(join(root, "src/lib/locales/surfaces/buy-ru.json"), "utf8")).v2.sellBack.confirmAnotherSale, /продать/);
});
