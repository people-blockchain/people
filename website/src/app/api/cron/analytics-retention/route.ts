import { NextResponse } from "next/server";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { purgeAnalyticsOlderThan } from "@/lib/analytics/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function handleRetention(req: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const viaCron = cronAuthorized(req);
  const viaAdmin = req.method === "POST" && (await isDiscoverAdmin());
  if (!viaCron && !viaAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = await getDbReady();
  const result = await purgeAnalyticsOlderThan(db);
  return NextResponse.json({ ok: true, ...result });
}

/** Vercel Cron: GET with `Authorization: Bearer CRON_SECRET`. */
export async function GET(req: Request) {
  return handleRetention(req);
}

/** Manual trigger: POST with Bearer CRON_SECRET or discover admin session. */
export async function POST(req: Request) {
  return handleRetention(req);
}
