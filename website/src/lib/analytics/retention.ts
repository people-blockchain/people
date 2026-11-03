import { lt } from "drizzle-orm";
import type { PartnerDb } from "@/db";
import { analyticsEvents, analyticsSessions } from "@/db/schema";

/** Default retention window for raw analytics rows (13 calendar months). */
export const ANALYTICS_RETENTION_MONTHS = 13;

export async function purgeAnalyticsOlderThan(
  db: PartnerDb,
  months = ANALYTICS_RETENTION_MONTHS,
): Promise<{ eventsDeleted: number; sessionsDeleted: number; cutoff: string }> {
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);

  const events = await db
    .delete(analyticsEvents)
    .where(lt(analyticsEvents.createdAt, cutoff))
    .returning({ id: analyticsEvents.id });
  const sessions = await db
    .delete(analyticsSessions)
    .where(lt(analyticsSessions.startedAt, cutoff))
    .returning({ id: analyticsSessions.id });

  return {
    eventsDeleted: events.length,
    sessionsDeleted: sessions.length,
    cutoff: cutoff.toISOString(),
  };
}
