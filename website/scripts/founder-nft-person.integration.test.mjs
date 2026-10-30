import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import { eq } from "drizzle-orm";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = { apiKey: "test-key", scorerId: "42", minScore: 20 };
const WALLET_A = "0x1111111111111111111111111111111111111111";

let db, schema, lib;

before(async () => {
  const { getDbReady } = await import("./fixtures/referral-pglite-db.mjs");
  db = await getDbReady();
  schema = await import("../src/db/schema.ts");
  lib = await import("../src/lib/founders/founder-nft-person.ts");
});

/** Stamps API v2 item with a full verifiable credential (synthetic values only). */
function stamp(subject) {
  return { version: "1.0.0", credential: { credentialSubject: { provider: "Synthetic", ...subject } }, metadata: null };
}

let seq = 0;
function nullifier(label) {
  seq += 1;
  return `v0.0.0:synthetic-${label}-${seq}`;
}

async function storedHashesOf(personId) {
  const rows = await db
    .select({ stampHash: schema.founderNftStampHashes.stampHash })
    .from(schema.founderNftStampHashes)
    .where(eq(schema.founderNftStampHashes.personId, personId));
  return rows.map((r) => r.stampHash).sort();
}

// ---------------------------------------------------------------- pure functions

test("extractStampNullifiers reads nullifiers[], falls back to legacy hash, dedups and sorts", () => {
  const items = [
    stamp({ nullifiers: ["v1:b", "v0:a"] }),
    stamp({ hash: "v0:legacy" }),
    stamp({ nullifiers: ["v0:a"], hash: "ignored-when-nullifiers-present" }),
    stamp({ nullifiers: ["", "  ", 7] }),
    { credential: null },
    "garbage",
  ];
  assert.deepEqual(lib.extractStampNullifiers(items), ["v0:a", "v0:legacy", "v1:b"]);
  assert.deepEqual(lib.extractStampNullifiers(undefined), []);
  assert.deepEqual(lib.extractStampNullifiers([stamp({})]), []);
});

test("hashStampNullifier is deterministic, hex, and never echoes the raw value", () => {
  const h = lib.hashStampNullifier("v0:secret-nullifier");
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, lib.hashStampNullifier("v0:secret-nullifier"));
  assert.notEqual(h, lib.hashStampNullifier("v0:other"));
  assert.ok(!h.includes("secret"));
});

test("newFounderNftPersonId is an opaque bytes32 hex value", () => {
  const a = lib.newFounderNftPersonId();
  assert.match(a, /^0x[0-9a-f]{64}$/);
  assert.notEqual(a, lib.newFounderNftPersonId());
});

test("decideFounderNftPerson: none / create / existing / conflict", () => {
  assert.deepEqual(lib.decideFounderNftPerson([], []), { kind: "no_stamps" });
  assert.deepEqual(lib.decideFounderNftPerson(["b", "a", "a"], []), { kind: "create", newHashes: ["a", "b"] });
  assert.deepEqual(lib.decideFounderNftPerson(["a", "b"], [{ stampHash: "a", personId: "0xp1" }]), {
    kind: "existing",
    personId: "0xp1",
    newHashes: ["b"],
  });
  assert.deepEqual(
    lib.decideFounderNftPerson(
      ["a", "b"],
      [
        { stampHash: "b", personId: "0xp2" },
        { stampHash: "a", personId: "0xp1" },
      ],
    ),
    { kind: "conflict", personIds: ["0xp1", "0xp2"] },
  );
});

// ---------------------------------------------------------------- repository (PGlite)

test("first sight creates a personId and stores only hashes", async () => {
  const n1 = nullifier("first");
  const n2 = nullifier("first");
  const res = await lib.resolveFounderNftPerson([n1, n2]);
  assert.equal(res.ok, true);
  assert.equal(res.created, true);
  assert.match(res.personId, /^0x[0-9a-f]{64}$/);
  assert.deepEqual(await storedHashesOf(res.personId), [lib.hashStampNullifier(n1), lib.hashStampNullifier(n2)].sort());

  const all = await db.select().from(schema.founderNftStampHashes);
  for (const row of all) {
    assert.ok(!row.stampHash.includes("synthetic"), "raw nullifier must never be stored");
  }
});

test("same stamps again (e.g. from a new wallet) resolve to the same personId = rebind", async () => {
  const n1 = nullifier("rebind");
  const n2 = nullifier("rebind");
  const first = await lib.resolveFounderNftPerson([n1, n2]);
  const again = await lib.resolveFounderNftPerson([n2, n1]);
  assert.equal(again.ok, true);
  assert.equal(again.created, false);
  assert.equal(again.personId, first.personId);
  assert.equal(again.addedHashes, 0);
});

test("any matching stamp identifies the person; new stamps are attached to it", async () => {
  const n1 = nullifier("partial");
  const n2 = nullifier("partial");
  const first = await lib.resolveFounderNftPerson([n1]);
  const second = await lib.resolveFounderNftPerson([n1, n2]);
  assert.equal(second.personId, first.personId);
  assert.equal(second.addedHashes, 1);
  // a later wallet presenting only the newer stamp is still the same person
  const third = await lib.resolveFounderNftPerson([n2]);
  assert.equal(third.personId, first.personId);
});

test("different stamps give different personIds", async () => {
  const a = await lib.resolveFounderNftPerson([nullifier("p")]);
  const b = await lib.resolveFounderNftPerson([nullifier("q")]);
  assert.notEqual(a.personId, b.personId);
});

test("stamps spanning two known persons are refused and logged without raw values", async () => {
  const na = nullifier("conflict-a");
  const nb = nullifier("conflict-b");
  const a = await lib.resolveFounderNftPerson([na]);
  const b = await lib.resolveFounderNftPerson([nb]);
  const extra = nullifier("conflict-extra");

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  let res;
  try {
    res = await lib.resolveFounderNftPerson([na, nb, extra]);
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(res, { ok: false, error: "conflict" });
  assert.equal(warnings.length, 1);
  const logged = JSON.stringify(warnings);
  assert.ok(logged.includes(a.personId) && logged.includes(b.personId));
  assert.ok(!logged.includes("synthetic"), "raw nullifiers must not be logged");
  // nothing was attached on refusal
  assert.deepEqual(await storedHashesOf(a.personId), [lib.hashStampNullifier(na)]);
  assert.deepEqual(await storedHashesOf(b.personId), [lib.hashStampNullifier(nb)]);
});

test("no stamps -> refused, nothing created", async () => {
  const before = (await db.select().from(schema.founderNftPersons)).length;
  assert.deepEqual(await lib.resolveFounderNftPerson([]), { ok: false, error: "no_stamps" });
  assert.equal((await db.select().from(schema.founderNftPersons)).length, before);
});

// ---------------------------------------------------------------- Stamps API client

test("fetchHumanPassportStampNullifiers reads /v2/stamps/{address}, follows same-origin next, ignores score", async () => {
  const calls = [];
  const pages = {
    first: { next: "/v2/stamps/page-2", items: [stamp({ nullifiers: ["v0:x"] })] },
    second: { next: null, items: [stamp({ hash: "v0:y" })] },
  };
  const fetchMock = async (url, init) => {
    calls.push({ url: String(url), key: init.headers["X-API-KEY"] });
    const body = String(url).includes("page-2") ? pages.second : pages.first;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const res = await lib.fetchHumanPassportStampNullifiers({
    walletAddress: WALLET_A,
    fetch: fetchMock,
    readConfig: () => CONFIG,
  });
  assert.deepEqual(res, { ok: true, address: WALLET_A, nullifiers: ["v0:x", "v0:y"] });
  assert.equal(calls[0].url, `https://api.passport.xyz/v2/stamps/${WALLET_A}?limit=1000`);
  assert.equal(calls[1].url, "https://api.passport.xyz/v2/stamps/page-2");
  assert.ok(calls.every((c) => c.key === "test-key"));
  assert.ok(calls.every((c) => !c.url.includes("/score/")));
});

test("fetchHumanPassportStampNullifiers refuses foreign next pages, bad input and API errors", async () => {
  const foreign = async () =>
    new Response(JSON.stringify({ next: "https://evil.example/v2/stamps/x", items: [stamp({ hash: "v0:z" })] }));
  // foreign `next` is not followed; the page read so far is returned
  assert.deepEqual(
    await lib.fetchHumanPassportStampNullifiers({ walletAddress: WALLET_A, fetch: foreign, readConfig: () => CONFIG }),
    { ok: true, address: WALLET_A, nullifiers: ["v0:z"] },
  );
  const never = async () => {
    throw new Error("must not fetch");
  };
  assert.deepEqual(
    await lib.fetchHumanPassportStampNullifiers({ walletAddress: WALLET_A, fetch: never, readConfig: () => null }),
    { ok: false, error: "not_configured" },
  );
  assert.deepEqual(
    await lib.fetchHumanPassportStampNullifiers({ walletAddress: "nope", fetch: never, readConfig: () => CONFIG }),
    { ok: false, error: "invalid_address" },
  );
  const failing = async () => new Response("{}", { status: 500 });
  assert.deepEqual(
    await lib.fetchHumanPassportStampNullifiers({ walletAddress: WALLET_A, fetch: failing, readConfig: () => CONFIG }),
    { ok: false, error: "verification_failed" },
  );
  const malformed = async () => new Response(JSON.stringify({ items: "x" }));
  assert.deepEqual(
    await lib.fetchHumanPassportStampNullifiers({ walletAddress: WALLET_A, fetch: malformed, readConfig: () => CONFIG }),
    { ok: false, error: "verification_failed" },
  );
});

// ---------------------------------------------------------------- DDL sync

test("founder nft person bootstrap mirrors drizzle 0021 SQL file", async () => {
  const { FOUNDER_NFT_PERSON_SCHEMA_STATEMENTS } = await import("../src/db/bootstrap-sql.mjs");
  const fromFile = readFileSync(join(root, "drizzle/0021_founder_nft_person.sql"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  assert.equal(FOUNDER_NFT_PERSON_SCHEMA_STATEMENTS.length, fromFile.length);
  for (let i = 0; i < fromFile.length; i += 1) {
    assert.equal(FOUNDER_NFT_PERSON_SCHEMA_STATEMENTS[i].replace(/\s+/g, " "), fromFile[i].replace(/\s+/g, " "));
  }
});
