import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { eq } from "drizzle-orm";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

let db, schema, ingest, aggregate, ga;

before(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const {
    ANALYTICS_SCHEMA_STATEMENTS,
    ANALYTICS_GA_INDEX_STATEMENTS,
    PARTNER_SCHEMA_STATEMENTS,
    FOUNDERS_SCHEMA_STATEMENTS,
    FOUNDERS_V2_SCHEMA_STATEMENTS,
  } = await import("../src/db/bootstrap-sql.mjs");
  const client = new PGlite();
  for (const statement of PARTNER_SCHEMA_STATEMENTS) await client.exec(statement);
  for (const statement of FOUNDERS_SCHEMA_STATEMENTS) await client.exec(statement);
  for (const statement of FOUNDERS_V2_SCHEMA_STATEMENTS) await client.exec(statement);
  for (const statement of ANALYTICS_SCHEMA_STATEMENTS) await client.exec(statement);
  for (const statement of ANALYTICS_GA_INDEX_STATEMENTS) await client.exec(statement);
  await client.exec(`CREATE TABLE IF NOT EXISTS "ppl_sale_order" (
  "id" text PRIMARY KEY NOT NULL,
  "networkId" text NOT NULL,
  "stable" text NOT NULL,
  "peopleAddress" text NOT NULL,
  "payerAddress" text,
  "status" text NOT NULL DEFAULT 'pending_payment',
  "usdtQuoted" double precision NOT NULL,
  "pplQuoted" double precision NOT NULL,
  "paymentMicro" numeric(24, 0) NOT NULL,
  "paymentMemo" text,
  "soldPplAtQuote" double precision NOT NULL,
  "paymentTxId" text,
  "paymentSeenAt" timestamp,
  "confirmedAt" timestamp,
  "deliveryTxId" text,
  "deliveredAt" timestamp,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
)`);
  schema = await import("../src/db/schema.ts");
  db = drizzle(client, { schema });
  ingest = await import("../src/lib/analytics/ingest.ts");
  aggregate = await import("../src/lib/analytics/aggregate.ts");
  ga = await import("../src/lib/analytics/aggregate-ga.ts");
});

test("ingest + KPI aggregation excludes bots", async () => {
  const restore = (await import("../src/lib/analytics/visitor.ts")).resetAnalyticsSaltSecretForTests(
    "agg-test-salt",
  );
  try {
    await ingest.ingestTrackBatch({
      db,
      ip: "198.51.100.10",
      userAgent: "Mozilla/5.0 (Macintosh) HumanBrowser/1.0",
      geo: { country: "US", region: "CA", city: "San Francisco" },
      payload: {
        sid: "session-human-001",
        events: [
          { type: "pageview", path: "/buy", title: "Buy" },
          { type: "heartbeat", path: "/buy", durationMs: 6000 },
          { type: "heartbeat", path: "/buy", durationMs: 4000 },
          { type: "custom", name: "buy_connect_wallet", path: "/buy" },
        ],
      },
    });

    await ingest.ingestTrackBatch({
      db,
      ip: "198.51.100.11",
      userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)",
      geo: { country: "US", region: null, city: null },
      payload: {
        sid: "session-bot-001",
        events: [{ type: "pageview", path: "/", title: "Home" }],
      },
    });

    const end = new Date();
    const start = new Date(end.getTime() - 60_000);
    const kpis = await aggregate.queryAnalyticsKpis(db, { start, end });
    assert.equal(kpis.sessions, 1);
    assert.equal(kpis.pageviews, 1);
    assert.equal(kpis.visitors, 1);

    const dash = await aggregate.queryAnalyticsDashboard(db, { start, end });
    assert.ok(dash.topPages.some((p) => p.path === "/buy"));
    assert.equal(dash.topPages.find((p) => p.path === "/buy")?.avgTimeSec, 10);
    const gaDash = await ga.queryAnalyticsGaDashboard(db, { start, end }, undefined, "/buy");
    assert.equal(gaDash.overview.newUsers, 1);
    assert.ok(gaDash.acquisition.channels.length >= 1);
    assert.equal(gaDash.funnels.buy.connectWallet, 1);
  } finally {
    restore();
  }

  const botRows = await db.select().from(schema.analyticsSessions).where(eq(schema.analyticsSessions.isBot, true));
  assert.equal(botRows.length, 1);
});
