import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import { isDatabaseConfigured } from "@/db";
import {
  isWalletVaultConfigured,
  migrateAllWalletVaults,
} from "@/lib/wallet-cloud-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}

function wantsDryRun(req: Request, body: unknown): boolean {
  if (req.method === "GET") return true;
  const url = new URL(req.url);
  if (url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true") {
    return true;
  }
  if (body && typeof body === "object" && "dryRun" in body) {
    return (body as { dryRun?: unknown }).dryRun === true;
  }
  return false;
}

async function handle(req: Request) {
  if (!isDatabaseConfigured() || !isWalletVaultConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }

  const viaCron = cronAuthorized(req);
  const viaAdmin = await isDiscoverAdmin();
  if (!viaCron && !viaAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }

  let body: unknown = null;
  if (req.method === "POST") {
    const text = await req.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
      }
    }
  }

  const dryRun = wantsDryRun(req, body);
  const result = await migrateAllWalletVaults({ dryRun });
  return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
}

/** Dry-run counts per vaultVersion. Bearer CRON_SECRET or discover admin. */
export async function GET(req: Request) {
  return handle(req);
}

/** Live migrate (or dry-run when `dryRun` is set). Bearer CRON_SECRET or discover admin. */
export async function POST(req: Request) {
  return handle(req);
}
