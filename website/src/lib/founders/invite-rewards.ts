import { and, eq, sql } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founderPointsLedger, founders } from "@/db/schema";

export async function clawBackInviterPointsForBot(inviteeUserId: string): Promise<void> {
  const db = await getDbReady();
  const invitee = await db.select().from(founders).where(eq(founders.userId, inviteeUserId)).limit(1);
  const row = invitee[0];
  if (!row) return;

  // Flag first and unconditionally: the flag is what later eligibility checks read, so it
  // must be set even when there is no inviter or no ledger entry to claw back.
  if (!row.isBot) {
    await db.update(founders).set({ isBot: true }).where(eq(founders.userId, inviteeUserId));
  }

  if (!row.invitedByUserId) return;

  const inviterId = row.invitedByUserId;
  const key = `invite:${inviteeUserId}`;
  const ledger = await db
    .select()
    .from(founderPointsLedger)
    .where(
      and(eq(founderPointsLedger.userId, inviterId), eq(founderPointsLedger.idempotencyKey, key)),
    )
    .limit(1);
  const entry = ledger[0];
  if (!entry) return;

  await db.transaction(async (tx) => {
    await tx
      .update(founders)
      .set({
        totalPoints: sql`GREATEST(0, ${founders.totalPoints} - ${entry.awardedPoints})`,
      })
      .where(eq(founders.userId, inviterId));
    await tx.delete(founderPointsLedger).where(eq(founderPointsLedger.id, entry.id));
  });
}
