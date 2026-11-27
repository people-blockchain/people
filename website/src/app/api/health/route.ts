import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/db/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

/**
 * Liveness + Neon Postgres readiness probe (`SELECT 1` with bounded timeout).
 * Never runs runtime DDL and never returns credentials or raw DB error text.
 */
export async function GET() {
  const db = await checkDatabaseHealth();
  if (!db.ok) {
    return NextResponse.json(
      { ok: false, db: { ok: false, reason: db.reason } },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json(
    { ok: true, db: { ok: true, latencyMs: db.latencyMs } },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}

export async function HEAD() {
  const db = await checkDatabaseHealth();
  return new NextResponse(null, {
    status: db.ok ? 200 : 503,
    headers: NO_STORE_HEADERS,
  });
}
