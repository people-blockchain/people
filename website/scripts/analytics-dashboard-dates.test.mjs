/**
 * Ensures raw analytics SQL never binds JS Date objects (postgres-js / Neon prod driver).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

let db, ingest, aggregate, ga;

function assertNoDateExecuteParams(query) {
  const params = query?.params ?? query?.values;
  if (!params) return;
  for (const p of params) {
    assert.notEqual(
      Object.prototype.toString.call(p),
      "[object Date]",
      "db.execute must not receive Date bind params; use sqlTimestamptz() + ::timestamptz",
    );
  }
}

function guardExecute(original) {
  return async function guardedExecute(query, ...rest) {
    assertNoDateExecuteParams(query);
    return original.call(this, query, ...rest);
  };
}

/** Mirrors GA dashboard tabs (overview, realtime, acquisition, geography, tech, engagement, conversions, journey). */
function assertGaDashboardTabs(dash) {
  assert.equal(typeof dash.kpis.sessions, "number");
  assert.ok(dash.realtime.active5Min >= 0);
  assert.ok(Array.isArray(dash.overview.hourly));
  assert.equal(typeof dash.overview.newUsers, "number");
  assert.equal(typeof dash.overview.returningUsers, "number");
  assert.equal(typeof dash.overview.engagementRate, "number");
  assert.ok(Array.isArray(dash.acquisition.channels));
  assert.ok(Array.isArray(dash.acquisition.sourceMedium));
  assert.ok(Array.isArray(dash.acquisition.landingPages));
  assert.ok(Array.isArray(dash.geography.regions));
  assert.ok(Array.isArray(dash.geography.mapCountries));
  assert.ok(Array.isArray(dash.tech.screenResolutions));
  assert.ok(Array.isArray(dash.engagement.pages));
  assert.ok(Array.isArray(dash.engagement.siteSearches));
  assert.ok(Array.isArray(dash.conversions.foundersFunnel));
  assert.ok(Array.isArray(dash.conversions.buyFunnel));
  assert.ok(Array.isArray(dash.conversions.retentionCohorts));
  assert.ok(Array.isArray(dash.journey.nextPages));
  if (dash.compare) {
    assert.equal(typeof dash.compare.sessions, "number");
  }
}

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
  const schema = await import("../src/db/schema.ts");
  db = drizzle(client, { schema });
  db.execute = guardExecute(db.execute.bind(db));
  ingest = await import("../src/lib/analytics/ingest.ts");
  aggregate = await import("../src/lib/analytics/aggregate.ts");
  ga = await import("../src/lib/analytics/aggregate-ga.ts");
});

async function seedMinimal() {
  const restore = (await import("../src/lib/analytics/visitor.ts")).resetAnalyticsSaltSecretForTests("date-guard-salt");
  try {
    await ingest.ingestTrackBatch({
      db,
      ip: "198.51.100.20",
      userAgent: "Mozilla/5.0 (Macintosh) HumanBrowser/1.0",
      geo: { country: "DE", region: "BE", city: "Berlin" },
      payload: {
        sid: "session-date-guard-1",
        events: [
          { type: "pageview", path: "/", title: "Home" },
          { type: "pageview", path: "/buy", title: "Buy" },
          { type: "custom", name: "site_search", path: "/", props: { query: "people" } },
        ],
      },
    });
    await ingest.ingestTrackBatch({
      db,
      ip: "198.51.100.21",
      userAgent: "Mozilla/5.0 (Macintosh) HumanBrowser/1.0",
      geo: { country: "US", region: "CA", city: "SF" },
      payload: {
        sid: "session-date-guard-2",
        events: [{ type: "pageview", path: "/", title: "Home" }],
      },
    });
  } finally {
    restore();
  }
}

const PRESETS = ["today", "7d", "30d", "90d"];

test("GA dashboard aggregation for all presets avoids Date execute params", async () => {
  await seedMinimal();
  for (const preset of PRESETS) {
    const { range, compare } = aggregate.parseAnalyticsRange(preset, null, null);
    assert.ok(compare, `${preset} should include compare range`);
    const dash = await ga.queryAnalyticsGaDashboard(db, range, compare, "/buy");
    assertGaDashboardTabs(dash);
  }
});

test("GA dashboard custom range with compare avoids Date execute params", async () => {
  await seedMinimal();
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
  const { range, compare } = aggregate.parseAnalyticsRange(null, start.toISOString(), end.toISOString());
  assert.ok(compare);
  const dash = await ga.queryAnalyticsGaDashboard(db, range, compare, "/buy");
  assertGaDashboardTabs(dash);
  assert.ok(dash.overview.newUsers + dash.overview.returningUsers >= 0);
});

test("seeded window hits raw-SQL paths (new/returning, retention, journey)", async () => {
  await seedMinimal();
  const end = new Date();
  const start = new Date(end.getTime() - 60_000);
  const span = end.getTime() - start.getTime();
  const compare = { start: new Date(start.getTime() - span), end: start };
  const dash = await ga.queryAnalyticsGaDashboard(db, { start, end }, compare, "/");
  assertGaDashboardTabs(dash);
  assert.ok(dash.kpis.sessions >= 1, "seeded sessions should fall in explicit sub-minute window");
  assert.ok(dash.journey.nextPages.some((p) => p.path === "/buy"), "journey SQL should see / -> /buy");
});

test("sqlTimestamptz returns ISO strings", async () => {
  const { sqlTimestamptz } = await import("../src/lib/analytics/sql-timestamptz.ts");
  const d = new Date("2026-11-03T12:00:00.000Z");
  assert.equal(sqlTimestamptz(d), "2026-11-03T12:00:00.000Z");
});
