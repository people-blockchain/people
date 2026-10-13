import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateGrowthRewards,
  formatPplAmount,
  parseGrowthClaimsFromSnapshot,
  resolvePplBalanceFromAccount,
} from "./wallet-summary.ts";

test("resolvePplBalanceFromAccount prefers balances.ppl", () => {
  assert.equal(resolvePplBalanceFromAccount({ balance: 5, balances: { ppl: 12 } }), 12);
});

test("formatPplAmount shows zero balance as 0 PPL", () => {
  assert.equal(formatPplAmount(0), "0 PPL");
  assert.equal(formatPplAmount(resolvePplBalanceFromAccount({ balance: 0, balances: { ppl: 0 } })), "0 PPL");
});

test("aggregateGrowthRewards splits claimable and settled", () => {
  const totals = aggregateGrowthRewards([
    { key: "a", amount: 10, status: "claimable" },
    { key: "b", amount: 3, status: "settled" },
    { key: "c", amount: 2, status: "returned" },
  ]);
  assert.equal(totals.accrued, 15);
  assert.equal(totals.claimable, 10);
  assert.equal(totals.claimed, 3);
});

test("parseGrowthClaimsFromSnapshot reads nested chainState", () => {
  const addr = "0xabc0000000000000000000000000000000000001";
  const claims = parseGrowthClaimsFromSnapshot(
    {
      chainState: {
        growthClaims: {
          "1:0xabc0000000000000000000000000000000000001:0xdef:1": {
            referrer: addr,
            amount: 7,
            status: "claimable",
            level: 1,
            epoch: 1,
          },
        },
      },
    },
    addr,
  );
  assert.equal(claims.length, 1);
  assert.equal(claims[0]!.amount, 7);
});
