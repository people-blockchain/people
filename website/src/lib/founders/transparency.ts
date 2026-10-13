/**
 * Read-only queries behind the /transparency page.
 *
 * Every block is fed by real rows: the community counters and the ambassador list come
 * from `founder`, the monthly report from `founder` + `discover_project`. Nothing here
 * fabricates a value — when a source is empty or unavailable the page hides the block
 * instead of rendering a placeholder number.
 */
import { and, count, countDistinct, desc, eq, gte, isNotNull, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDbReady } from "@/db";
import { discoverProjects, founderReferralAmbassadors, founders, users } from "@/db/schema";

/** Founders the rest of the code base treats as verified (see isActiveInvitee / eligibleBeneficiary). */
function verifiedFounder() {
  return and(isNotNull(founders.verifiedAt), eq(founders.isBot, false));
}

export type CommunityCounters = {
  verifiedPeople: number;
  countries: number;
};

/**
 * `verifiedPeople` is deliberately *not* `getFounderPublicStats().verifiedCount`: that field is
 * a raw row count of every registered founder, while this page must only claim people whose
 * phone/human verification actually completed.
 */
export async function getCommunityCounters(): Promise<CommunityCounters> {
  const db = await getDbReady();
  const [people] = await db.select({ value: count() }).from(founders).where(verifiedFounder());
  const [countries] = await db
    .select({ value: countDistinct(founders.countryCode) })
    .from(founders)
    .where(verifiedFounder());
  return {
    verifiedPeople: Number(people?.value ?? 0),
    countries: Number(countries?.value ?? 0),
  };
}

export type AmbassadorRow = {
  founderNumber: number;
  /** Shortened on the server: the full address is never handed to a public list. */
  walletShort: string;
  verifiedInvitees: number;
  /** Founder granted the referral ambassador cap (exceeding the standard invitee limit). */
  ambassador: boolean;
  /** Only when the founder opted in — otherwise null. */
  name: string | null;
  avatar: string | null;
};

export const MAX_AMBASSADORS = 100;

/** First 6 / last 4 hex characters is enough to recognise an address without publishing it in full. */
export function shortenWallet(address: string): string {
  const value = address.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/**
 * Founders ranked by how many *verified* people they invited. The ambassador flag is
 * surfaced rather than used as a filter: a founder who brought in verified invitees is
 * the thing worth showing, whether or not they also carry the raised invitee cap.
 */
export async function getTopAmbassadors(limit = MAX_AMBASSADORS): Promise<AmbassadorRow[]> {
  const db = await getDbReady();
  const invitee = alias(founders, "invitee");
  const rows = await db
    .select({
      founderNumber: founders.founderNumber,
      walletAddress: founders.walletAddress,
      verifiedInvitees: count(invitee.userId),
      ambassador: sql<boolean>`(${founderReferralAmbassadors.userId} is not null)`,
      name: sql<string | null>`case when ${founders.publicProfileOptIn} then ${users.name} else null end`,
      avatar: sql<string | null>`case when ${founders.publicProfileOptIn} then ${users.image} else null end`,
    })
    .from(founders)
    .innerJoin(
      invitee,
      and(
        eq(invitee.invitedByUserId, founders.userId),
        isNotNull(invitee.verifiedAt),
        eq(invitee.isBot, false),
      ),
    )
    .leftJoin(founderReferralAmbassadors, eq(founderReferralAmbassadors.userId, founders.userId))
    .leftJoin(users, eq(users.id, founders.userId))
    .where(eq(founders.isBot, false))
    .groupBy(
      founders.userId,
      founders.founderNumber,
      founders.walletAddress,
      founders.publicProfileOptIn,
      users.name,
      users.image,
      founderReferralAmbassadors.userId,
    )
    .orderBy(desc(count(invitee.userId)), founders.founderNumber)
    .limit(Math.min(Math.max(limit, 1), MAX_AMBASSADORS));

  return rows.map((row) => ({
    founderNumber: row.founderNumber,
    walletShort: shortenWallet(row.walletAddress),
    verifiedInvitees: Number(row.verifiedInvitees),
    ambassador: Boolean(row.ambassador),
    name: row.name ?? null,
    avatar: row.avatar ?? null,
  }));
}

export type FounderLookup = {
  founderNumber: number;
  walletShort: string;
  countryCode: string;
  registeredAt: string;
  verified: boolean;
  optedIn: boolean;
  name: string | null;
  avatar: string | null;
};

/** `null` means "no founder matches"; an invalid query shape is also `null`. */
export async function lookupFounder(raw: string): Promise<FounderLookup | null> {
  const q = raw.trim();
  const byNumber = /^\d{1,12}$/.test(q);
  const byWallet = /^0x[0-9a-fA-F]{40}$/.test(q);
  if (!byNumber && !byWallet) return null;

  const db = await getDbReady();
  const rows = await db
    .select({
      founderNumber: founders.founderNumber,
      walletAddress: founders.walletAddress,
      countryCode: founders.countryCode,
      registeredAt: founders.registeredAt,
      verifiedAt: founders.verifiedAt,
      optedIn: founders.publicProfileOptIn,
      name: users.name,
      avatar: users.image,
    })
    .from(founders)
    .leftJoin(users, eq(users.id, founders.userId))
    .where(byNumber ? eq(founders.founderNumber, Number(q)) : eq(founders.walletAddress, q.toLowerCase()))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    founderNumber: row.founderNumber,
    walletShort: shortenWallet(row.walletAddress),
    countryCode: row.countryCode,
    registeredAt: row.registeredAt.toISOString(),
    verified: Boolean(row.verifiedAt),
    optedIn: Boolean(row.optedIn),
    name: row.optedIn ? row.name ?? null : null,
    avatar: row.optedIn ? row.avatar ?? null : null,
  };
}

export type MonthlyReport = {
  /** Normalised `YYYY-MM`. */
  month: string;
  newVerifiedPeople: number;
  topCountries: { countryCode: string; count: number }[];
  launches: { id: string; title: string }[];
};

const MAX_REPORT_LAUNCHES = 8;
const MAX_REPORT_COUNTRIES = 5;

/** `YYYY-MM` in UTC, or null when the input is not a month. */
export function parseReportMonth(month: string | null | undefined): { key: string; start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec((month ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (year < 2000 || year > 2100 || monthIndex < 0 || monthIndex > 11) return null;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { key: `${match[1]}-${match[2]}`, start, end };
}

/** Growth, top countries and launches for one calendar month, all read from stored rows. */
export async function getMonthlyReport(month: string | null | undefined): Promise<MonthlyReport | null> {
  const range = parseReportMonth(month);
  if (!range) return null;
  const db = await getDbReady();
  const inMonth = and(
    gte(founders.registeredAt, range.start),
    lt(founders.registeredAt, range.end),
    verifiedFounder(),
  );

  const [people] = await db.select({ value: count() }).from(founders).where(inMonth);
  const countryRows = await db
    .select({ countryCode: founders.countryCode, value: count() })
    .from(founders)
    .where(inMonth)
    .groupBy(founders.countryCode)
    .orderBy(desc(count()), founders.countryCode)
    .limit(MAX_REPORT_COUNTRIES);

  const launchRows = await db
    .select({ id: discoverProjects.id, title: discoverProjects.title })
    .from(discoverProjects)
    .where(
      and(
        gte(discoverProjects.createdAt, range.start),
        lt(discoverProjects.createdAt, range.end),
        ne(discoverProjects.status, "archived"),
      ),
    )
    .orderBy(desc(discoverProjects.createdAt))
    .limit(MAX_REPORT_LAUNCHES);

  return {
    month: range.key,
    newVerifiedPeople: Number(people?.value ?? 0),
    topCountries: countryRows.map((row) => ({
      countryCode: row.countryCode,
      count: Number(row.value),
    })),
    launches: launchRows.map((row) => ({ id: row.id, title: row.title })),
  };
}

/** Reads/writes the founder's own opt-in flag. Returns the stored value. */
export async function setPublicProfileOptIn(userId: string, optIn: boolean): Promise<boolean | null> {
  const db = await getDbReady();
  const rows = await db
    .update(founders)
    .set({ publicProfileOptIn: optIn })
    .where(eq(founders.userId, userId))
    .returning({ value: founders.publicProfileOptIn });
  return rows[0] ? Boolean(rows[0].value) : null;
}
