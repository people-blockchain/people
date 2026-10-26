import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  INITIAL_DELIVERY_STATE,
  decideAutoBuy,
  deliveredFromRoute,
  reduceBalanceSample,
  type AutoBuyInput,
  type AutoBuyTrigger,
} from "./autoBuy.ts";
import { BASE_MAINNET_USDC } from "./saleChain.ts";

const usdc = (dollars: string): bigint => {
  const [whole, frac = ""] = dollars.split(".");
  return BigInt(whole) * BigInt(1_000_000) + BigInt(frac.padEnd(6, "0").slice(0, 6) || "0");
};

const event = (dollars: string, routeId: string | null = "route-1"): AutoBuyTrigger => ({
  source: "event",
  routeId,
  deliveredUnits: usdc(dollars),
});

function input(trigger: AutoBuyTrigger, extra: Partial<AutoBuyInput> = {}): AutoBuyInput {
  return { chainKey: "base", trigger, minUsd: 10, maxUsd: 500, alreadyTriggered: new Set(), ...extra };
}

test("a delivery inside the limits starts the step for that amount", () => {
  const d = decideAutoBuy(input(event("120")));
  assert.deepEqual(d, { action: "start", amountUsd: 120, key: "route:route-1", capped: false });
});

test("amount is rounded down to the cent", () => {
  const d = decideAutoBuy(input(event("25.999999")));
  assert.equal(d.action, "start");
  if (d.action === "start") assert.equal(d.amountUsd, 25.99);
  const d2 = decideAutoBuy(input(event("10.004")));
  assert.equal(d2.action === "start" && d2.amountUsd, 10);
});

test("limits are inclusive: exactly min and exactly max start", () => {
  const atMin = decideAutoBuy(input(event("10")));
  assert.equal(atMin.action === "start" && atMin.amountUsd, 10);
  const atMax = decideAutoBuy(input(event("500")));
  assert.equal(atMax.action === "start" && atMax.capped, false);
  assert.equal(atMax.action === "start" && atMax.amountUsd, 500);
});

test("below min -> none with reason below-min and the floored amount", () => {
  assert.deepEqual(decideAutoBuy(input(event("9.999999"))), { action: "none", reason: "below-min", amountUsd: 9.99 });
  assert.deepEqual(decideAutoBuy(input(event("0.5"))), { action: "none", reason: "below-min", amountUsd: 0.5 });
});

test("above max -> buys max, remainder stays with the user", () => {
  const d = decideAutoBuy(input(event("1234.56")));
  assert.deepEqual(d, { action: "start", amountUsd: 500, key: "route:route-1", capped: true });
  const d2 = decideAutoBuy(input(event("500.01")));
  assert.equal(d2.action === "start" && d2.amountUsd, 500);
  assert.equal(d2.action === "start" && d2.capped, true);
});

test("nothing delivered -> none (zero, negative, dust below a cent, unknown amount)", () => {
  for (const trigger of [
    event("0"),
    { source: "event", routeId: "r", deliveredUnits: null } as AutoBuyTrigger,
    { source: "event", routeId: "r", deliveredUnits: BigInt(9999) } as AutoBuyTrigger,
    { source: "balance", balanceBefore: usdc("50"), balanceAfter: usdc("50") } as AutoBuyTrigger,
    { source: "balance", balanceBefore: usdc("50"), balanceAfter: usdc("40") } as AutoBuyTrigger,
  ]) {
    assert.deepEqual(decideAutoBuy(input(trigger)), { action: "none", reason: "no-delivery" });
  }
});

test("auto-buy is off on the Sepolia sale chain", () => {
  assert.deepEqual(decideAutoBuy(input(event("100"), { chainKey: "base-sepolia" })), {
    action: "none",
    reason: "disabled-chain",
  });
});

test("the same route never starts twice", () => {
  const triggered = new Set<string>();
  const first = decideAutoBuy(input(event("100"), { alreadyTriggered: triggered }));
  assert.equal(first.action, "start");
  if (first.action === "start") triggered.add(first.key);
  assert.deepEqual(decideAutoBuy(input(event("100"), { alreadyTriggered: triggered })), {
    action: "none",
    reason: "duplicate",
  });
  const other = decideAutoBuy(input(event("100", "route-2"), { alreadyTriggered: triggered }));
  assert.equal(other.action, "start");
});

test("a balance growth is deduplicated by its sequence, equal amounts later are new", () => {
  const delivery = (seq: number): AutoBuyTrigger => ({
    source: "balance",
    balanceBefore: usdc("5"),
    balanceAfter: usdc("105"),
    seq,
  });
  const triggered = new Set<string>();
  const first = decideAutoBuy(input(delivery(1), { alreadyTriggered: triggered }));
  assert.equal(first.action === "start" && first.amountUsd, 100);
  if (first.action === "start") triggered.add(first.key);
  assert.equal(decideAutoBuy(input(delivery(1), { alreadyTriggered: triggered })).action, "none");
  assert.equal(decideAutoBuy(input(delivery(2), { alreadyTriggered: triggered })).action, "start");
});

test("a purchase in flight blocks a new start without marking it", () => {
  assert.deepEqual(decideAutoBuy(input(event("100"), { busy: true })), { action: "none", reason: "busy" });
});

test("invalid limits are rejected", () => {
  assert.equal(decideAutoBuy(input(event("100"), { minUsd: 0 })).action, "none");
  assert.equal(decideAutoBuy(input(event("100"), { minUsd: 50, maxUsd: 10 })).action, "none");
});

test("balance reducer: first sample only sets the baseline", () => {
  const r = reduceBalanceSample(INITIAL_DELIVERY_STATE, usdc("42"));
  assert.equal(r.delivery, null);
  assert.equal(r.state.baseline, usdc("42"));
});

test("balance reducer: growth emits one delivery, then stays quiet", () => {
  let s = reduceBalanceSample(INITIAL_DELIVERY_STATE, usdc("5")).state;
  const grown = reduceBalanceSample(s, usdc("105"));
  assert.deepEqual(grown.delivery, { balanceBefore: usdc("5"), balanceAfter: usdc("105"), seq: 1 });
  s = grown.state;
  assert.equal(reduceBalanceSample(s, usdc("105")).delivery, null);
});

test("balance reducer: spending lowers the baseline, a later top-up is a new delivery", () => {
  let s = reduceBalanceSample(INITIAL_DELIVERY_STATE, usdc("100")).state;
  const spent = reduceBalanceSample(s, usdc("0"));
  assert.equal(spent.delivery, null);
  assert.equal(spent.state.baseline, BigInt(0));
  s = spent.state;
  const again = reduceBalanceSample(s, usdc("100"));
  assert.equal(again.delivery?.seq, 1);
  const third = reduceBalanceSample(reduceBalanceSample(again.state, usdc("0")).state, usdc("100"));
  assert.equal(third.delivery?.seq, 2);
});

test("balance reducer output feeds the decision end to end", () => {
  const s = reduceBalanceSample(INITIAL_DELIVERY_STATE, usdc("1")).state;
  const { delivery } = reduceBalanceSample(s, usdc("751"));
  assert.ok(delivery);
  const d = decideAutoBuy(input({ source: "balance", ...delivery }));
  assert.equal(d.action === "start" && d.amountUsd, 500);
  assert.equal(d.action === "start" && d.capped, true);
});

test("deliveredFromRoute reads Base USDC, prefers toAmountMin, rejects other tokens/chains", () => {
  const route = {
    id: "abc",
    toChainId: 8453,
    toAmount: "100500000",
    toAmountMin: "99000000",
    toToken: { address: BASE_MAINNET_USDC.toLowerCase(), chainId: 8453 },
  };
  assert.deepEqual(deliveredFromRoute(route), { routeId: "abc", deliveredUnits: BigInt(99_000_000) });
  assert.equal(deliveredFromRoute({ ...route, toAmountMin: undefined }).deliveredUnits, BigInt(100_500_000));
  assert.equal(deliveredFromRoute({ ...route, toChainId: 1, toToken: { address: route.toToken.address, chainId: 1 } }).deliveredUnits, null);
  assert.equal(deliveredFromRoute({ ...route, toToken: { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", chainId: 8453 } }).deliveredUnits, null);
  assert.equal(deliveredFromRoute({ ...route, toAmount: "1.5", toAmountMin: "x" }).deliveredUnits, null);
  assert.deepEqual(deliveredFromRoute(undefined), { routeId: null, deliveredUnits: null });
});

test("a route event and the balance growth of the same payment do not both start", () => {
  const triggered = new Set<string>();
  const fromEvent = decideAutoBuy(input(event("100"), { alreadyTriggered: triggered }));
  assert.equal(fromEvent.action, "start");
  if (fromEvent.action === "start") triggered.add(fromEvent.key);
  // the buy is in flight when the balance poll sees the growth
  const fromBalance = decideAutoBuy(
    input({ source: "balance", balanceBefore: BigInt(0), balanceAfter: usdc("100"), seq: 1 }, { alreadyTriggered: triggered, busy: true }),
  );
  assert.deepEqual(fromBalance, { action: "none", reason: "busy" });
});

const here = (path: string) => new URL(path, import.meta.url);

test("delivery handling never signs: handleDelivery has no buy() call, the user clicks the CTA", () => {
  const src = readFileSync(here("../../components/buy/BuyForm.tsx"), "utf8");
  const start = src.indexOf("const handleDelivery = useCallback(");
  const end = src.indexOf("const onBridgeComplete = useCallback(");
  assert.ok(start > 0 && end > start, "handleDelivery block found");
  const block = src.slice(start, end);
  assert.doesNotMatch(block, /\bbuy\s*\(/);
  assert.doesNotMatch(block, /\bvoid\s+buy\b/);
  // the only place that starts the flow is the click handler
  assert.match(src, /autoBuyCta/);
  assert.match(src, /onClick=\{\(\) => void onBuyClick\(\)\}/);
});

test("every locale has the 'Buy on <chain>' string with the {chain} placeholder", () => {
  for (const lang of ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"]) {
    const json = JSON.parse(readFileSync(here(`../locales/surfaces/buy-${lang}.json`), "utf8"));
    const label = json.form?.autoBuyCta;
    assert.equal(typeof label, "string", lang);
    assert.ok(label.includes("{chain}"), lang);
  }
});
