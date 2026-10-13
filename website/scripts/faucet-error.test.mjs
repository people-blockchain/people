import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { faucetErrorMessage } from "../src/lib/faucet-error.ts";

const copy = {
  faucetErrRateLimited: "rate",
  faucetErrBusy: "busy",
  faucetErrDailyBudget: "budget",
  faucetErrUnavailable: "unavailable",
};

test("known faucet codes map to their own sentence", () => {
  assert.equal(faucetErrorMessage("rate_limited", copy), "rate");
  assert.equal(faucetErrorMessage("faucet_busy", copy), "busy");
  assert.equal(faucetErrorMessage("daily_budget_exhausted", copy), "budget");
});

test("daily_budget_exhausted prefers the faucet's own message", () => {
  const server = "Faucet is empty for today, try again tomorrow";
  assert.equal(faucetErrorMessage("daily_budget_exhausted", copy, server), server);
  assert.equal(faucetErrorMessage("daily_budget_exhausted", copy, "   "), "budget");
  assert.equal(faucetErrorMessage("daily_budget_exhausted", copy, null), "budget");
});

test("unknown, missing and proxy/network codes fall back to one unavailable sentence", () => {
  for (const code of [undefined, null, "", "amount_too_large", "faucet_insufficient_funds", "faucet_unavailable", "invalid_address", "http_502", "not_found"]) {
    assert.equal(faucetErrorMessage(code, copy), "unavailable", String(code));
  }
});

test("English copy carries the exact sentences the wallet action shows", () => {
  const en = JSON.parse(
    readFileSync(new URL("../src/lib/locales/surfaces/wallet-ux-en.json", import.meta.url), "utf8"),
  );
  assert.equal(en.faucetSent, "100 test PPL sent to your address.");
  assert.equal(
    faucetErrorMessage("rate_limited", en),
    "This address already received test PPL in the last 24 hours (limit 100 PPL per day). Try again tomorrow.",
  );
  assert.equal(faucetErrorMessage("faucet_busy", en), "The faucet is busy. Try again in a minute.");
  assert.equal(faucetErrorMessage("mystery", en), "Faucet is unavailable right now. Try again later.");
});
