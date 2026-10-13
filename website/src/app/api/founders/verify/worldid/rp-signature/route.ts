import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { readFoundersWorldIdConfig } from "@/lib/founders/world-id-config";
import { getFounderByUserId } from "@/lib/founders/service";

export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const config = readFoundersWorldIdConfig();
  if (!config) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const founder = await getFounderByUserId(guard.userId);
  if (!founder) {
    return NextResponse.json({ error: "not_registered" }, { status: 403 });
  }

  const body = (await request.json()) as { action?: string };
  const action = body.action?.trim() || config.action;
  if (action !== config.action) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const { sig, nonce, createdAt, expiresAt } = signRequest({
    signingKeyHex: config.signingKeyHex,
    action,
  });

  return NextResponse.json({
    sig,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
  });
}
