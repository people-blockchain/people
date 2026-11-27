import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildBootstrapClientOptions,
  buildPostgresClientOptions,
  getHealthPingTimeoutMs,
  isRuntimeSchemaBootstrapDisabled,
  parsePositiveIntEnv,
} from "../src/db/config.ts";
import { ensurePartnerSchema, resetPartnerSchemaBootstrapForTests, validateAppRoleName } from "../src/db/bootstrap.ts";
import { checkDatabaseHealth, resetHealthProbeForTests } from "../src/db/health.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("parsePositiveIntEnv parses valid ints and clamps to bounds", () => {
  assert.equal(parsePositiveIntEnv(undefined, 5, 1, 20), 5);
  assert.equal(parsePositiveIntEnv("", 5, 1, 20), 5);
  assert.equal(parsePositiveIntEnv("abc", 5, 1, 20), 5);
  assert.equal(parsePositiveIntEnv("-3", 5, 1, 20), 5);
  assert.equal(parsePositiveIntEnv("0", 5, 1, 20), 1);
  assert.equal(parsePositiveIntEnv("999", 5, 1, 20), 20);
  assert.equal(parsePositiveIntEnv(" 8 ", 5, 1, 20), 8);
});

test("buildPostgresClientOptions uses hardened defaults and respects env overrides", () => {
  assert.deepEqual(buildPostgresClientOptions({}), {
    max: 5,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 5,
    max_lifetime: 1800,
  });

  assert.deepEqual(
    buildPostgresClientOptions({
      DB_POOL_MAX: "3",
      DB_IDLE_TIMEOUT_SEC: "15",
      DB_CONNECT_TIMEOUT_SEC: "7",
      DB_MAX_LIFETIME_SEC: "900",
    }),
    {
      max: 3,
      prepare: false,
      idle_timeout: 15,
      connect_timeout: 7,
      max_lifetime: 900,
    },
  );
});

test("buildBootstrapClientOptions enforces bounded connect_timeout (5s default)", () => {
  assert.deepEqual(buildBootstrapClientOptions({}), {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 5,
  });
  assert.equal(buildBootstrapClientOptions({ DB_BOOTSTRAP_CONNECT_TIMEOUT_SEC: "12" }).connect_timeout, 12);
});

test("getHealthPingTimeoutMs defaults to 2000ms and clamps", () => {
  assert.equal(getHealthPingTimeoutMs({}), 2000);
  assert.equal(getHealthPingTimeoutMs({ DB_HEALTH_TIMEOUT_MS: "50" }), 200);
  assert.equal(getHealthPingTimeoutMs({ DB_HEALTH_TIMEOUT_MS: "3500" }), 3500);
});

test("isRuntimeSchemaBootstrapDisabled recognizes true/1 only", () => {
  assert.equal(isRuntimeSchemaBootstrapDisabled({}), false);
  assert.equal(isRuntimeSchemaBootstrapDisabled({ DB_SKIP_RUNTIME_BOOTSTRAP: "false" }), false);
  assert.equal(isRuntimeSchemaBootstrapDisabled({ DB_SKIP_RUNTIME_BOOTSTRAP: "0" }), false);
  assert.equal(isRuntimeSchemaBootstrapDisabled({ DB_SKIP_RUNTIME_BOOTSTRAP: "1" }), true);
  assert.equal(isRuntimeSchemaBootstrapDisabled({ DB_SKIP_RUNTIME_BOOTSTRAP: "TRUE" }), true);
});

test("ensurePartnerSchema is a zero-I/O no-op when DB_SKIP_RUNTIME_BOOTSTRAP=true", async () => {
  const prevUrl = process.env.DATABASE_URL;
  const prevSkip = process.env.DB_SKIP_RUNTIME_BOOTSTRAP;
  process.env.DATABASE_URL = "postgres://people_app:unused@127.0.0.1:9/neondb";
  process.env.DB_SKIP_RUNTIME_BOOTSTRAP = "true";
  resetPartnerSchemaBootstrapForTests();
  try {
    // Port 9 is unreachable; resolving proves no connection attempt was made.
    await ensurePartnerSchema();
  } finally {
    if (prevUrl !== undefined) process.env.DATABASE_URL = prevUrl;
    else delete process.env.DATABASE_URL;
    if (prevSkip !== undefined) process.env.DB_SKIP_RUNTIME_BOOTSTRAP = prevSkip;
    else delete process.env.DB_SKIP_RUNTIME_BOOTSTRAP;
    resetPartnerSchemaBootstrapForTests();
  }
});

test("validateAppRoleName rejects unsafe identifiers", () => {
  assert.equal(validateAppRoleName("people_app"), "people_app");
  assert.throws(() => validateAppRoleName("people_app; DROP TABLE users;"));
  assert.throws(() => validateAppRoleName("PeopleApp"));
  assert.throws(() => validateAppRoleName(""));
});

test("checkDatabaseHealth reports unconfigured when DATABASE_URL is absent", async () => {
  const res = await checkDatabaseHealth({ isConfigured: () => false });
  assert.deepEqual(res, { ok: false, reason: "unconfigured" });
});

test("checkDatabaseHealth reports ok with measured latency on success", async () => {
  let tick = 1000;
  const res = await checkDatabaseHealth({
    isConfigured: () => true,
    ping: async () => {
      tick = 1017;
    },
    now: () => tick,
  });
  assert.deepEqual(res, { ok: true, latencyMs: 17 });
});

test("checkDatabaseHealth returns timeout when ping exceeds budget", async () => {
  let logged = 0;
  const res = await checkDatabaseHealth({
    isConfigured: () => true,
    timeoutMs: 25,
    ping: () => new Promise(() => {}),
    onError: () => {
      logged += 1;
    },
  });
  assert.deepEqual(res, { ok: false, reason: "timeout" });
  assert.equal(logged, 1);
});

test("checkDatabaseHealth returns sanitized unavailable without leaking error text", async () => {
  const secretErr = new Error("connect ECONNREFUSED postgres://neondb_owner:npg_secret123@host/neondb");
  const res = await checkDatabaseHealth({
    isConfigured: () => true,
    ping: async () => {
      throw secretErr;
    },
    onError: () => {},
  });
  assert.deepEqual(res, { ok: false, reason: "unavailable" });
  assert.equal(JSON.stringify(res).includes("npg_secret123"), false);
});

test("/api/health GET and HEAD return 503 with Cache-Control: no-store when DB is unconfigured", async () => {
  const prevUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  resetHealthProbeForTests();
  try {
    const { GET, HEAD } = await import("../src/app/api/health/route.ts");
    const getRes = await GET();
    assert.equal(getRes.status, 503);
    assert.equal(getRes.headers.get("cache-control"), "no-store");
    const body = await getRes.json();
    assert.deepEqual(body, { ok: false, db: { ok: false, reason: "unconfigured" } });

    const headRes = await HEAD();
    assert.equal(headRes.status, 503);
    assert.equal(headRes.headers.get("cache-control"), "no-store");
    assert.equal(await headRes.text(), "");
  } finally {
    if (prevUrl !== undefined) process.env.DATABASE_URL = prevUrl;
    else delete process.env.DATABASE_URL;
    resetHealthProbeForTests();
  }
});

test("provision SQL script grants least-privilege DML only and contains no real password", () => {
  const sql = readFileSync(join(root, "scripts/db-provision-app-role.sql"), "utf8");
  assert.match(sql, /CREATE ROLE people_app/);
  assert.match(sql, /NOSUPERUSER/);
  assert.match(sql, /NOCREATEDB/);
  assert.match(sql, /NOCREATEROLE/);
  assert.match(sql, /NOBYPASSRLS/);
  assert.match(sql, /NOREPLICATION/);
  assert.match(sql, /statement_timeout/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO people_app/);
  assert.match(sql, /GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO people_app/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public/);
  assert.doesNotMatch(sql, /npg_/);
  assert.doesNotMatch(sql, /GRANT ALL/i);
});
