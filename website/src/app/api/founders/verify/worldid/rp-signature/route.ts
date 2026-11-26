import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { lt } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founderWorldIdNonces } from "@/db/schema";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { foundersWorldIdUiEnabled, readFoundersWorldIdConfig } from "@/lib/founders/world-id-config";
import { getFounderByUserId } from "@/lib/founders/service";

export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  if (!foundersWorldIdUiEnabled()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const config = readFoundersWorldIdConfig();
  if (!config) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rateKey = `${guard.userId}:${clientIp(request)}`;
  if (!(await checkSharedRateLimit("founders-worldid-rp", rateKey, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const founder = await getFounderByUserId(guard.userId);
  if (!founder) {
    return NextResponse.json({ error: "not_registered" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action?.trim() || config.action;
  if (action !== config.action) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const { sig, nonce, createdAt, expiresAt } = signRequest({
    signingKeyHex: config.signingKeyHex,
    action,
  });

  const db = await getDbReady();
  await db
    .insert(founderWorldIdNonces)
    .values({
      nonce,
      userId: guard.userId,
      action,
      expiresAt: new Date(expiresAt * 1000),
      createdAt: new Date(createdAt * 1000),
    })
    .onConflictDoNothing();
  if (Math.random() < 0.05) {
    await db.delete(founderWorldIdNonces).where(lt(founderWorldIdNonces.expiresAt, new Date())).catch(() => {});
  }

  return NextResponse.json({
    sig,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
  });
}
