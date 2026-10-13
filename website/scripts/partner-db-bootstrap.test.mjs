import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function statementsFromSqlFile() {
  const raw = readFileSync(join(root, "drizzle/0000_partner_auth.sql"), "utf8");
  return raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function statementsFromFoundersV2SqlFile() {
  const raw = readFileSync(join(root, "drizzle/0005_founders_verification.sql"), "utf8");
  return raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function statementsFromLavkaSqlFile() {
  const raw = readFileSync(join(root, "drizzle/0007_lavka.sql"), "utf8");
  return raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function statementsFromWorldIdSqlFile() {
  const raw = readFileSync(join(root, "drizzle/0006_founders_world_id_nullifier.sql"), "utf8");
  return raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

test("lavka bootstrap mirrors drizzle 0007 SQL file", async () => {
  const { LAVKA_SCHEMA_STATEMENTS } = await import("../src/db/bootstrap-sql.mjs");
  const fromFile = statementsFromLavkaSqlFile();
  assert.equal(LAVKA_SCHEMA_STATEMENTS.length, fromFile.length);
  for (let i = 0; i < fromFile.length; i += 1) {
    assert.equal(
      LAVKA_SCHEMA_STATEMENTS[i].replace(/\s+/g, " "),
      fromFile[i].replace(/\s+/g, " "),
    );
  }
});

test("founders world id bootstrap mirrors drizzle 0006 SQL file", async () => {
  const { FOUNDERS_WORLD_ID_SCHEMA_STATEMENTS } = await import("../src/db/bootstrap-sql.mjs");
  const fromFile = statementsFromWorldIdSqlFile();
  assert.equal(FOUNDERS_WORLD_ID_SCHEMA_STATEMENTS.length, fromFile.length);
  for (let i = 0; i < fromFile.length; i += 1) {
    assert.equal(
      FOUNDERS_WORLD_ID_SCHEMA_STATEMENTS[i].replace(/\s+/g, " "),
      fromFile[i].replace(/\s+/g, " "),
    );
  }
});

test("founders v2 bootstrap mirrors drizzle 0005 SQL file", async () => {
  const { FOUNDERS_V2_SCHEMA_STATEMENTS } = await import("../src/db/bootstrap-sql.mjs");
  const fromFile = statementsFromFoundersV2SqlFile();
  assert.equal(FOUNDERS_V2_SCHEMA_STATEMENTS.length, fromFile.length);
  for (let i = 0; i < fromFile.length; i += 1) {
    assert.equal(
      FOUNDERS_V2_SCHEMA_STATEMENTS[i].replace(/\s+/g, " "),
      fromFile[i].replace(/\s+/g, " "),
    );
  }
});

test("every founders v2 bootstrap statement is idempotent DDL", async () => {
  const { FOUNDERS_V2_SCHEMA_STATEMENTS } = await import("../src/db/bootstrap-sql.mjs");
  for (const statement of FOUNDERS_V2_SCHEMA_STATEMENTS) {
    assert.match(statement, /IF NOT EXISTS/i);
  }
});

test("bootstrap statements mirror drizzle SQL file", async () => {
  const { PARTNER_SCHEMA_STATEMENTS } = await import("../src/db/bootstrap-sql.mjs");
  const fromFile = statementsFromSqlFile();
  assert.equal(PARTNER_SCHEMA_STATEMENTS.length, fromFile.length);
  for (let i = 0; i < fromFile.length; i += 1) {
    assert.equal(PARTNER_SCHEMA_STATEMENTS[i].replace(/\s+/g, " "), fromFile[i].replace(/\s+/g, " "));
  }
});

test("every bootstrap statement is idempotent DDL", async () => {
  const { PARTNER_SCHEMA_STATEMENTS } = await import("../src/db/bootstrap-sql.mjs");
  for (const statement of PARTNER_SCHEMA_STATEMENTS) {
    assert.match(statement, /IF NOT EXISTS/i);
  }
});

test("bootstrap clears cached promise after failure so later calls can retry", async () => {
  const src = readFileSync(join(root, "src/db/bootstrap.ts"), "utf8");
  assert.match(src, /\.catch\(\(error\) => \{/);
  assert.match(src, /bootstrapPromise = null/);
});

test("ensurePartnerSchema is a no-op without DATABASE_URL", async () => {
  const prev = process.env.DATABASE_URL;
  const prevUnpooled = process.env.DATABASE_URL_UNPOOLED;
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_UNPOOLED;
  const { ensurePartnerSchema, resetPartnerSchemaBootstrapForTests } = await import("../src/db/bootstrap.ts");
  resetPartnerSchemaBootstrapForTests();
  try {
    await ensurePartnerSchema();
  } finally {
    if (prev !== undefined) process.env.DATABASE_URL = prev;
    else delete process.env.DATABASE_URL;
    if (prevUnpooled !== undefined) process.env.DATABASE_URL_UNPOOLED = prevUnpooled;
    else delete process.env.DATABASE_URL_UNPOOLED;
    resetPartnerSchemaBootstrapForTests();
  }
});
