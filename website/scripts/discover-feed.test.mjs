/**
 * WEB-M1 — the Discover feed must cost a fixed number of queries regardless of how many
 * projects exist. The decision itself is a pure function (`selectFeedProjects`), tested here
 * without a DB; the batched query path (`listFeedProjects`) is exercised against in-memory
 * Postgres so the page bounds and the multi-row exposure insert are proven end to end.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

let db, schema, service, scoring;

before(async () => {
  ({ getDbReady: globalThis.__getDb } = await import("./fixtures/referral-pglite-db.mjs"));
  db = await globalThis.__getDb();
  schema = await import("../src/db/schema.ts");
  service = await import("../src/lib/discover/service.ts");
  scoring = await import("../src/lib/discover/scoring-config.ts");
});

let seq = 0;
function row(overrides = {}) {
  seq += 1;
  const now = new Date(2026, 0, 1 + seq);
  return {
    id: `p${seq}`,
    authorUserId: null,
    title: `t${seq}`,
    videoUri: null,
    screenshotUris: "[]",
    tokenIconUri: null,
    idea: "idea",
    audience: "audience",
    whyToken: "why",
    tokenAssetId: "asset",
    tokenLink: "https://example.com/token",
    productUrl: null,
    stageIndex: 0,
    revision: 1,
    status: "active",
    weightedScore: 0,
    isSeed: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/* ── pure decision function ───────────────────────────────────────────────── */

test("selectFeedProjects: seeds and promoted projects are always visible", () => {
  const seed = row({ isSeed: true });
  const promoted = row({ stageIndex: 3, status: "promoted" });
  const { visible, recordExposuresFor } = service.selectFeedProjects({
    projects: [seed, promoted],
    viewerUserId: null,
    viewerIsVerified: false,
    exposureCounts: new Map(),
    viewerExposed: new Set(),
  });
  assert.deepEqual(
    visible.map((p) => p.id).sort(),
    [seed.id, promoted.id].sort(),
  );
  assert.equal(recordExposuresFor.length, 0);
});

test("selectFeedProjects: anonymous viewers see no active unexposed projects", () => {
  const active = row();
  const { visible } = service.selectFeedProjects({
    projects: [active],
    viewerUserId: null,
    viewerIsVerified: false,
    exposureCounts: new Map(),
    viewerExposed: new Set(),
  });
  assert.equal(visible.length, 0);
});

test("selectFeedProjects: an author always sees their own active project", () => {
  const mine = row({ authorUserId: "u1" });
  const { visible } = service.selectFeedProjects({
    projects: [mine],
    viewerUserId: "u1",
    viewerIsVerified: false,
    exposureCounts: new Map(),
    viewerExposed: new Set(),
  });
  assert.deepEqual(visible.map((p) => p.id), [mine.id]);
});

test("selectFeedProjects: first exposure of a verified viewer is shown and scheduled", () => {
  const active = row();
  const { visible, recordExposuresFor } = service.selectFeedProjects({
    projects: [active],
    viewerUserId: "u1",
    viewerIsVerified: true,
    exposureCounts: new Map(),
    viewerExposed: new Set(),
  });
  assert.deepEqual(visible.map((p) => p.id), [active.id]);
  assert.deepEqual(recordExposuresFor, [active.id]);
});

test("selectFeedProjects: a full audience cap hides the project and records nothing", () => {
  const active = row({ stageIndex: 0 });
  const cap = scoring.stageAudienceCap(0);
  const { visible, recordExposuresFor } = service.selectFeedProjects({
    projects: [active],
    viewerUserId: "u1",
    viewerIsVerified: true,
    exposureCounts: new Map([[active.id, cap]]),
    viewerExposed: new Set(),
  });
  assert.equal(visible.length, 0);
  assert.equal(recordExposuresFor.length, 0);
});

test("selectFeedProjects: an already-exposed viewer keeps seeing it without a new row", () => {
  const active = row({ stageIndex: 0 });
  const cap = scoring.stageAudienceCap(0);
  const { visible, recordExposuresFor } = service.selectFeedProjects({
    projects: [active],
    viewerUserId: "u1",
    viewerIsVerified: true,
    exposureCounts: new Map([[active.id, cap]]),
    viewerExposed: new Set([active.id]),
  });
  assert.deepEqual(visible.map((p) => p.id), [active.id]);
  assert.equal(recordExposuresFor.length, 0);
});

test("selectFeedProjects: archived projects are dropped", () => {
  const archived = row({ status: "archived" });
  const { visible } = service.selectFeedProjects({
    projects: [archived],
    viewerUserId: "u1",
    viewerIsVerified: true,
    exposureCounts: new Map(),
    viewerExposed: new Set(),
  });
  assert.equal(visible.length, 0);
});

/* ── batched query path (in-memory Postgres) ──────────────────────────────── */

async function insertProject(id, stageIndex, minute) {
  await db.insert(schema.discoverProjects).values({
    id,
    title: `project ${id}`,
    idea: "idea",
    audience: "audience",
    whyToken: "why",
    tokenAssetId: "asset",
    tokenLink: "https://example.com/token",
    stageIndex,
    status: stageIndex >= 3 ? "promoted" : "active",
    isSeed: false,
    createdAt: new Date(2026, 0, 1, 0, minute),
  });
  return id;
}

test("listFeedProjects: pages the feed and reports hasMore", async () => {
  for (let n = 1; n <= 5; n++) await insertProject(`itp-${n}`, 3, n);

  const first = await service.listFeedProjects(null, false, { limit: 2 });
  assert.equal(first.projects.length, 2);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextOffset, 2);

  const second = await service.listFeedProjects(null, false, { limit: 2, offset: 2 });
  const firstIds = new Set(first.projects.map((p) => p.id));
  for (const p of second.projects) assert.equal(firstIds.has(p.id), false, "pages must not overlap");
});

test("listFeedProjects: clamps the page size", async () => {
  const page = await service.listFeedProjects(null, false, { limit: 10_000 });
  assert.ok(page.projects.length <= service.DISCOVER_FEED_MAX_PAGE_SIZE);
});

test("listFeedProjects: records exposures for the page in one insert, not one per project", async () => {
  // Active projects (stage < 3) require an exposure row before they are shown.
  for (let n = 1; n <= 3; n++) await insertProject(`exp-${n}`, 0, 30 + n);
  const viewer = "feed-viewer";
  const before = await db.select().from(schema.discoverExposures);
  const seen = await service.listFeedProjects(viewer, true, { limit: 3 });
  assert.equal(seen.projects.length, 3);
  const after = await db.select().from(schema.discoverExposures);
  const added = after.filter((r) => r.userId === viewer);
  assert.equal(added.length, seen.projects.length - before.filter((r) => r.userId === viewer).length);
  for (const p of seen.projects) {
    assert.ok(added.some((r) => r.projectId === p.id), `missing exposure for ${p.id}`);
  }

  // A second call for an already-exposed viewer must not add rows.
  const again = await service.listFeedProjects(viewer, true, { limit: 3 });
  assert.deepEqual(
    again.projects.map((p) => p.id).sort(),
    seen.projects.map((p) => p.id).sort(),
  );
  const final = await db.select().from(schema.discoverExposures);
  assert.equal(final.filter((r) => r.userId === viewer).length, added.length);
});
