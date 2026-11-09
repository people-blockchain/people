import assert from "node:assert/strict";
import { before, test } from "node:test";
import { register } from "node:module";
import { eq } from "drizzle-orm";
import {
  BASE_CHAIN_ID,
  BASE_PPL_CURVE_HUB_ADDRESS,
  type JsonRpcTransport,
} from "./bought-matcher.ts";

register("../../../scripts/fixtures/referral-db-loader.mjs", import.meta.url);

let db: Awaited<ReturnType<typeof import("../../../scripts/fixtures/referral-pglite-db.mjs")["getDbReady"]>>;
let schema: typeof import("@/db/schema");
let runCurveHubReferralSync: typeof import("./curve-hub-sync.ts")["runCurveHubReferralSync"];

before(async () => {
  const pglite = await import("../../../scripts/fixtures/referral-pglite-db.mjs");
  globalThis.__getDb = pglite.getDbReady;
  db = await pglite.getDbReady();
  schema = await import("@/db/schema");
  ({ runCurveHubReferralSync } = await import("./curve-hub-sync.ts"));
});

test("runCurveHubReferralSync is idempotent with mock RPC (no live network)", async () => {
  const buyer = "0x1111111111111111111111111111111111111111";
  const kolUser = crypto.randomUUID();
  const buyerUser = crypto.randomUUID();
  await db.insert(schema.users).values([
    { id: kolUser, email: "kol-sync@example.com" },
    { id: buyerUser, email: "buyer-sync@example.com" },
  ]);
  await db.insert(schema.partners).values([
    { userId: kolUser, referralCode: "kolsync001", kolCode: "kolsync1" },
    {
      userId: buyerUser,
      referralCode: "buyersync1",
      referredByUserId: kolUser,
      referredByKolCode: "kolsync1",
    },
  ]);
  await db.insert(schema.saleBuyerBindings).values({
    buyerWallet: buyer,
    userId: buyerUser,
    referrerUserId: kolUser,
    kolCode: "kolsync1",
    source: "cookie",
  });

  const blockNumber = 10_000;
  const blockHash = `0x${"bb".repeat(32)}`;

  const rpc: JsonRpcTransport = async (method) => {
    if (method === "eth_blockNumber") return `0x${blockNumber.toString(16)}`;
    if (method === "eth_getLogs") return [];
    if (method === "eth_getBlockByNumber") return { hash: blockHash };
    throw new Error(`unexpected_rpc_${method}`);
  };

  const first = await runCurveHubReferralSync({ rpc, now: new Date() });
  assert.equal(first.ok, true);
  if (first.ok) {
    assert.equal(first.newPurchases, 0);
    assert.equal(first.duplicateSkipped, 0);
  }

  const [cursor] = await db
    .select()
    .from(schema.saleChainCursors)
    .where(eq(schema.saleChainCursors.chainId, BASE_CHAIN_ID));
  assert.ok(cursor);
  assert.equal(cursor.contractAddress, BASE_PPL_CURVE_HUB_ADDRESS.toLowerCase());
  assert.equal(cursor.lastScannedBlock, blockNumber);

  const second = await runCurveHubReferralSync({ rpc, now: new Date() });
  assert.equal(second.ok, true);
  if (second.ok) {
    assert.equal(second.newPurchases, 0);
  }
});
