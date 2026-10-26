import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { EMPTY_SALE_STATS, fetchRecentTrades, fetchSaleStats } from "./adapter.ts";
import { saleContractAddress, saleContractConfigured } from "./config.ts";
import { getBaseSaleNetwork } from "./sale-hub.ts";
import { useSalePhase } from "./sale-state.ts";
import { runBuy, type BuyStatus } from "./useBuyPpl.ts";

/**
 * `/buy` before the hub is deployed: production has no NEXT_PUBLIC_SALE_CHAIN, no
 * NEXT_PUBLIC_SALE_HUB_ADDRESS and no SEPOLIA_* / BASE_TEST_* variables. The page must show the
 * "sale opens soon" state, offer no purchase and make no hub call.
 */

const SALE_ENV_KEYS = [
  "VERCEL_ENV",
  "NEXT_PUBLIC_SALE_CHAIN",
  "NEXT_PUBLIC_SALE_HUB_ADDRESS",
  "NEXT_PUBLIC_SALE_STATS_URL",
  "SALE_CONTRACT_BASE",
  "NEXT_PUBLIC_SEPOLIA_HUB_ADDRESS",
  "NEXT_PUBLIC_BASE_TEST_HUB_ADDRESS",
];

function withProductionEnvWithoutHub<T>(fn: () => Promise<T> | T): Promise<T> {
  const saved = new Map(SALE_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of SALE_ENV_KEYS) delete process.env[key];
  process.env.VERCEL_ENV = "production";
  const restore = () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  return Promise.resolve()
    .then(fn)
    .finally(restore);
}

/** Fails the test if anything on the page talks to the network. */
function trapFetch(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    calls.push(String(input));
    throw new Error("unexpected network call");
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = original) };
}

test("no hub address: the sale is not configured and the hub address is null", () =>
  withProductionEnvWithoutHub(() => {
    assert.equal(saleContractAddress(), null);
    assert.equal(saleContractConfigured(), false);
    const network = getBaseSaleNetwork();
    assert.equal(network.enabled, false);
    assert.equal(network.evm.saleContract, "");
  }));

test("no hub address: the phase hook renders the closed ('soon') state without loading anything", () =>
  withProductionEnvWithoutHub(() => {
    const trap = trapFetch();
    try {
      let seen: ReturnType<typeof useSalePhase> | null = null;
      const Probe = () => {
        seen = useSalePhase();
        return null;
      };
      renderToString(createElement(Probe));
      assert.deepEqual(seen, { phase: "closed", loading: false, hubAcceptsUsdt: false });
      assert.deepEqual(trap.calls, []);
    } finally {
      trap.restore();
    }
  }));

test("no hub address: stats and trades are the empty shape and nothing is fetched", () =>
  withProductionEnvWithoutHub(async () => {
    const trap = trapFetch();
    try {
      // Even with an indexer URL set, no hub means no request.
      process.env.NEXT_PUBLIC_SALE_STATS_URL = "https://indexer.example/sale";
      assert.deepEqual(await fetchSaleStats(), EMPTY_SALE_STATS);
      assert.equal(EMPTY_SALE_STATS.status, "not_deployed");
      assert.deepEqual(await fetchRecentTrades(8), []);
      assert.deepEqual(trap.calls, []);
    } finally {
      trap.restore();
    }
  }));

test("no hub address: a purchase attempt stops before any wallet or RPC call", () =>
  withProductionEnvWithoutHub(async () => {
    let providerCalls = 0;
    const provider = {
      request: async () => {
        providerCalls += 1;
        throw new Error("unexpected wallet call");
      },
    };
    const statuses: BuyStatus[] = [];
    const result = await runBuy(
      {
        provider: provider as never,
        account: "0x00000000000000000000000000000000000000a1",
        token: "0x00000000000000000000000000000000000000b2",
        amountUsd: 50,
      },
      (status) => statuses.push(status),
    );
    assert.deepEqual(result, { step: "error", reason: "txFailed", detail: "sale_not_configured" });
    assert.deepEqual(statuses, [result]);
    assert.equal(providerCalls, 0);
  }));

// BuyForm.tsx is a client component and cannot be imported under node:test, so the gating that keeps
// the closed state inert is pinned at the source level.
const buyForm = readFileSync(join(import.meta.dirname, "../../components/buy/BuyForm.tsx"), "utf8");

test("BuyForm: every purchase path is gated on the sale being open", () => {
  assert.match(buyForm, /const open = phase === "open";/);
  // The main button is disabled whenever the sale is closed, and says so.
  assert.match(buyForm, /const buttonDisabled =\s*!open \|\|/);
  assert.match(buyForm, /const ctaLabel = !open\s*\? t\.form\.ctaClosed/);
  // Balance reads (token + ETH on the hub chain), the delivery watcher and the bridge widget are off while closed.
  assert.match(buyForm, /if \(!open \|\| !evmAddress \|\| !payToken\) \{\s*setBalances\(null\);\s*return;/);
  assert.match(buyForm, /enabled: open && bridgeAvailable/);
  assert.match(buyForm, /!open \?\s*\(\s*<p className="text-sm text-ink-2" data-testid="buy-bridge-closed">/);
  assert.match(buyForm, /\{!open \? closedLine : null\}/);
  // No automatic purchase after a delivery while closed.
  assert.match(buyForm, /if \(!cur\.open \|\| !cur\.provider \|\| !cur\.evmAddress\) return;/);
});

test("the closed state is the 'sale opens soon' copy in every locale", () => {
  const locales = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
  for (const locale of locales) {
    const copy = JSON.parse(
      readFileSync(join(import.meta.dirname, `../locales/surfaces/buy-${locale}.json`), "utf8"),
    ) as { hero: Record<string, string>; form: Record<string, string> };
    for (const value of [copy.hero.headlineClosed, copy.hero.statsTitleClosed, copy.form.ctaClosed, copy.form.openingDateTba]) {
      assert.ok(typeof value === "string" && value.trim().length > 0, locale);
    }
  }
});
