import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { eq } from "drizzle-orm";

register("./fixtures/bug-reports-db-loader.mjs", import.meta.url);

let db, schema, svc;

before(async () => {
  ({ getDbReady: globalThis.__getDb } = await import("./fixtures/bug-reports-pglite-db.mjs"));
  db = await globalThis.__getDb();
  schema = await import("../src/db/schema.ts");
  svc = await import("../src/lib/bug-reports/service.ts");
});

let seq = 0;
async function mkUser() {
  seq += 1;
  const id = `bu${seq}`;
  await db.insert(schema.users).values({ id, email: `${id}@x.test` });
  return id;
}

async function mkFounder(userId) {
  seq += 1;
  await db.insert(schema.founders).values({
    userId,
    founderNumber: seq,
    countryCode: "GE",
    entryMultiplier: 1,
    totalPoints: 0,
    walletAddress: `0x${seq.toString(16).padStart(40, "0")}`,
  });
}

// --- validateBugReportInput ---

test("validateBugReportInput rejects an empty/missing description", () => {
  assert.equal(svc.validateBugReportInput({}).ok, false);
  assert.equal(svc.validateBugReportInput({ description: "   " }).ok, false);
  const result = svc.validateBugReportInput({ description: "" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "description_required");
});

test("validateBugReportInput rejects a description over 4000 chars", () => {
  const result = svc.validateBugReportInput({ description: "x".repeat(4001) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "description_too_long");
});

test("validateBugReportInput rejects an oversized screenshot data URL", () => {
  const huge = `data:image/jpeg;base64,${"a".repeat(800_000)}`;
  const result = svc.validateBugReportInput({ description: "it broke", screenshot: huge });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "screenshot_too_large");
});

test("validateBugReportInput accepts a valid report and sanitizes context", () => {
  const result = svc.validateBugReportInput({
    description: "  Button does nothing  ",
    screenshot: "data:image/jpeg;base64,aGVsbG8=",
    context: { url: "https://example.com/x", theme: "dark", extra: "ignored-field-is-fine" },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.description, "Button does nothing");
    assert.equal(result.screenshotData, "data:image/jpeg;base64,aGVsbG8=");
    assert.equal(result.context.url, "https://example.com/x");
    assert.equal(result.context.theme, "dark");
  }
});

// --- create / list ---

test("createBugReport + listMyBugReports round-trips and is scoped per user", async () => {
  const userA = await mkUser();
  const userB = await mkUser();
  await svc.createBugReport(userA, { description: "A's bug", screenshotData: null, context: {} });
  await svc.createBugReport(userB, { description: "B's bug", screenshotData: null, context: {} });

  const aReports = await svc.listMyBugReports(userA);
  assert.equal(aReports.length, 1);
  assert.equal(aReports[0].description, "A's bug");
  assert.equal(aReports[0].status, "new");
  assert.equal(aReports[0].rewardPoints, 0);
});

// --- admin patch validation ---

test("patchBugReportAsAdmin rejects an unknown id, status, severity, or reward", async () => {
  const userId = await mkUser();
  const report = await svc.createBugReport(userId, { description: "bug", screenshotData: null, context: {} });

  assert.equal((await svc.patchBugReportAsAdmin("missing-id", {})).error, "not_found");
  assert.equal((await svc.patchBugReportAsAdmin(report.id, { status: "bogus" })).error, "invalid_status");
  assert.equal((await svc.patchBugReportAsAdmin(report.id, { severity: "bogus" })).error, "invalid_severity");
  assert.equal((await svc.patchBugReportAsAdmin(report.id, { rewardPoints: -1 })).error, "invalid_reward");
  assert.equal((await svc.patchBugReportAsAdmin(report.id, { rewardPoints: 1.5 })).error, "invalid_reward");
});

// --- reward idempotency ---

test("accepting a bug report credits founder points exactly once", async () => {
  const userId = await mkUser();
  await mkFounder(userId);
  const report = await svc.createBugReport(userId, { description: "bug", screenshotData: null, context: {} });

  const first = await svc.patchBugReportAsAdmin(report.id, { status: "accepted", rewardPoints: 50 });
  assert.equal(first.ok, true);
  assert.equal(first.credited, 50);

  const [founderRow] = await db.select().from(schema.founders).where(eq(schema.founders.userId, userId)).limit(1);
  assert.equal(founderRow.totalPoints, 50);

  // Repeated PATCH with the same (or a different) status stays reward-eligible — must not re-credit.
  const second = await svc.patchBugReportAsAdmin(report.id, { status: "accepted" });
  assert.equal(second.credited, 0);
  const third = await svc.patchBugReportAsAdmin(report.id, { status: "fixed" });
  assert.equal(third.credited, 0);

  const [afterRow] = await db.select().from(schema.founders).where(eq(schema.founders.userId, userId)).limit(1);
  assert.equal(afterRow.totalPoints, 50, "total points must not double-credit on repeated PATCH");
});

test("reverting status away from accepted and back does not double-credit", async () => {
  const userId = await mkUser();
  await mkFounder(userId);
  const report = await svc.createBugReport(userId, { description: "bug", screenshotData: null, context: {} });

  await svc.patchBugReportAsAdmin(report.id, { status: "accepted", rewardPoints: 30 });
  await svc.patchBugReportAsAdmin(report.id, { status: "new" }); // revert
  const reaccepted = await svc.patchBugReportAsAdmin(report.id, { status: "accepted" });
  assert.equal(reaccepted.credited, 0);

  const [row] = await db.select().from(schema.founders).where(eq(schema.founders.userId, userId)).limit(1);
  assert.equal(row.totalPoints, 30);
});

test("raising rewardPoints after the initial credit does not grant the difference", async () => {
  const userId = await mkUser();
  await mkFounder(userId);
  const report = await svc.createBugReport(userId, { description: "bug", screenshotData: null, context: {} });

  await svc.patchBugReportAsAdmin(report.id, { status: "accepted", rewardPoints: 10 });
  await svc.patchBugReportAsAdmin(report.id, { rewardPoints: 999 });

  const [row] = await db.select().from(schema.founders).where(eq(schema.founders.userId, userId)).limit(1);
  assert.equal(row.totalPoints, 10);
});

test("accepting with rewardPoints 0 does not credit; a later non-zero PATCH does", async () => {
  const userId = await mkUser();
  await mkFounder(userId);
  const report = await svc.createBugReport(userId, { description: "bug", screenshotData: null, context: {} });

  const first = await svc.patchBugReportAsAdmin(report.id, { status: "accepted" });
  assert.equal(first.credited, 0);

  const second = await svc.patchBugReportAsAdmin(report.id, { rewardPoints: 15 });
  assert.equal(second.credited, 15);

  const [row] = await db.select().from(schema.founders).where(eq(schema.founders.userId, userId)).limit(1);
  assert.equal(row.totalPoints, 15);
});

test("accepting a report from a user who never registered as a founder credits nothing, no error", async () => {
  const userId = await mkUser(); // no founders row
  const report = await svc.createBugReport(userId, { description: "bug", screenshotData: null, context: {} });

  const result = await svc.patchBugReportAsAdmin(report.id, { status: "accepted", rewardPoints: 40 });
  assert.equal(result.ok, true);
  assert.equal(result.credited, 0);
  assert.equal(result.report.rewardPoints, 40, "the report still records the admin-chosen reward for display");
});

// --- admin listing / filtering ---

test("listBugReportsForAdmin filters by status", async () => {
  const userId = await mkUser();
  const a = await svc.createBugReport(userId, { description: "one", screenshotData: null, context: {} });
  await svc.createBugReport(userId, { description: "two", screenshotData: null, context: {} });
  await svc.patchBugReportAsAdmin(a.id, { status: "rejected" });

  const rejected = await svc.listBugReportsForAdmin({ status: "rejected" });
  assert.ok(rejected.some((r) => r.id === a.id));
  assert.ok(rejected.every((r) => r.status === "rejected"));
});
