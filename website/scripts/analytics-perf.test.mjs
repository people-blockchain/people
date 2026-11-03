/**
 * Synthetic load test for analytics aggregation (local PGlite).
 * Default 100k events; set ANALYTICS_PERF_ROWS=1000000 for full run.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

const TARGET_ROWS = Number(process.env.ANALYTICS_PERF_ROWS ?? 100_000);

let client, db, ga;

before(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { ANALYTICS_SCHEMA_STATEMENTS, ANALYTICS_GA_INDEX_STATEMENTS, PARTNER_SCHEMA_STATEMENTS, FOUNDERS_SCHEMA_STATEMENTS, FOUNDERS_V2_SCHEMA_STATEMENTS } = await import(
    "../src/db/bootstrap-sql.mjs",
  );
  client = new PGlite();
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
  const schema = await import("../src/db/schema.ts");
  db = drizzle(client, { schema });
  ga = await import("../src/lib/analytics/aggregate-ga.ts");
});

test(`GA dashboard query under ${TARGET_ROWS} synthetic events`, async () => {
  const sessionId = crypto.randomUUID();
  const visitorId = "visitor-perf-1";
  const now = Date.now();
  await client.exec(
    `INSERT INTO analytics_session (id,"clientSessionId","visitorId","startedAt","lastSeenAt","durationSec","pageviewCount","isBounce","entryPath","exitPath","referrer","utmSource","utmMedium","utmCampaign","utmTerm","utmContent","refParam","kolParam",country,region,city,browser,os,"deviceType",language,timezone,"screenW","screenH","isBot") VALUES ('${sessionId}','client-${sessionId}','${visitorId}',to_timestamp(${
      (now - TARGET_ROWS * 1000) / 1000
    }),to_timestamp(${now / 1000}),3600,${TARGET_ROWS},false,'/','/p1','https://google.com/',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'US','CA','SF','Chrome','macOS','desktop','en-US','UTC',1920,1080,false)`,
  );
  const batch = 500;
  let inserted = 0;
  while (inserted < TARGET_ROWS) {
    const values = [];
    const take = Math.min(batch, TARGET_ROWS - inserted);
    for (let i = 0; i < take; i++) {
      const id = crypto.randomUUID();
      values.push(
        `('${id}','${sessionId}','${visitorId}','pageview',NULL,'/p${inserted + i}',NULL,'{}',NULL,to_timestamp(${
          (now - (inserted + i) * 1000) / 1000
        }),false)`,
      );
    }
    await client.exec(
      `INSERT INTO analytics_event (id,"sessionId","visitorId","eventType","eventName",path,title,props,"durationMs","createdAt","isBot") VALUES ${values.join(",")}`,
    );
    inserted += take;
  }

  const end = new Date();
  const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
  const t0 = performance.now();
  const dash = await ga.queryAnalyticsGaDashboard(db, { start, end }, undefined, "/p1");
  const ms = performance.now() - t0;
  assert.ok(dash.kpis.pageviews >= TARGET_ROWS - 1);
  console.log(`analytics GA dashboard (${TARGET_ROWS} events): ${ms.toFixed(0)}ms`);
  assert.ok(ms < 120_000, `dashboard query too slow: ${ms}ms`);
});
