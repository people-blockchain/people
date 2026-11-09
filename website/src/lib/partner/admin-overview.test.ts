import assert from "node:assert/strict";
import { before, test } from "node:test";
import { register } from "node:module";
import { eq } from "drizzle-orm";
import { serializeReferralCookie } from "./referral.ts";

register("../../../scripts/fixtures/referral-db-loader.mjs", import.meta.url);

let db: Awaited<ReturnType<typeof import("../../../scripts/fixtures/referral-pglite-db.mjs")["getDbReady"]>>;
let schema: typeof import("@/db/schema");
let service: typeof import("./service.ts");
let adminOverview: typeof import("./admin-overview.ts");

before(async () => {
  const pglite = await import("../../../scripts/fixtures/referral-pglite-db.mjs");
  globalThis.__getDb = pglite.getDbReady;
  db = await pglite.getDbReady();
  schema = await import("@/db/schema");
  service = await import("./service.ts");
  adminOverview = await import("./admin-overview.ts");
});

let seq = 0;
async function createUser(emailPrefix = "user"): Promise<string> {
  seq += 1;
  const id = crypto.randomUUID();
  await db.insert(schema.users).values({
    id,
    email: `${emailPrefix}${seq}@example.com`,
  });
  return id;
}

test("loadPartnersAdminOverview aggregates two partners, referral and click", async () => {
  const p1 = await createUser("partner1");
  const p2 = await createUser("partner2");
  const ref = await createUser("ref");

  await service.ensurePartner(p1);
  await service.ensurePartner(p2);
  const inviter = await service.ensurePartner(ref);

  await service.attachReferralIfEligible(
    p2,
    serializeReferralCookie(inviter.referralCode, Date.now()),
  );

  await db
    .update(schema.partners)
    .set({ referralClicks: 3 })
    .where(eq(schema.partners.userId, ref));

  const { summary, partners } = await adminOverview.loadPartnersAdminOverview();
  assert.equal(summary.totalPartners, 3);
  assert.ok(summary.totalClicks >= 3);

  const inviterRow = partners.find((p) => p.userId === ref);
  assert.ok(inviterRow);
  assert.equal(inviterRow!.clicks, 3);
  assert.equal(inviterRow!.l1Count, 1);
});
