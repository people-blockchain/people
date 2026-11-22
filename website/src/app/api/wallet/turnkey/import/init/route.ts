import { ensurePartnerSchema } from "@/db";
import { initTurnkeyPrivateKeyImport } from "@/lib/turnkey-import";
import { NextResponse } from "next/server";
import { mapTurnkeyError, NO_STORE, requireTurnkeySession } from "../../_shared";

export async function POST(request: Request) {
  const gate = await requireTurnkeySession(request, { freshAuth: true });
  if (!gate.ok) return gate.response;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  try {
    await ensurePartnerSchema();
    const result = await initTurnkeyPrivateKeyImport(gate.userId, body);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    return mapTurnkeyError(err);
  }
}
