import { ensurePartnerSchema } from "@/db";
import {
  completeTurnkeyPrivateKeyImport,
  markLegacyImportFailure,
  markLegacyImportMismatch,
} from "@/lib/turnkey-import";
import { NextResponse } from "next/server";
import { mapTurnkeyError, NO_STORE, requireTurnkeySession } from "../../_shared";

export async function POST(request: Request) {
  const gate = await requireTurnkeySession(request, { freshAuth: true });
  if (!gate.ok) return gate.response;
  let body: { encryptedBundle?: unknown; expectedAddress?: unknown; mismatch?: unknown; error?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return mapTurnkeyError(new Error("invalid_address"));
  }
  try {
    await ensurePartnerSchema();
    if (body.mismatch === true) {
      await markLegacyImportMismatch(gate.userId);
      return NextResponse.json({ error: "legacy_address_mismatch" }, { status: 409, headers: NO_STORE });
    }
    if (typeof body.error === "string" && body.error.trim()) {
      await markLegacyImportFailure(gate.userId, body.error.trim());
      return NextResponse.json({ error: "import_failed" }, { status: 409, headers: NO_STORE });
    }
    const result = await completeTurnkeyPrivateKeyImport({
      userId: gate.userId,
      encryptedBundle: typeof body.encryptedBundle === "string" ? body.encryptedBundle : "",
      expectedAddress: typeof body.expectedAddress === "string" ? body.expectedAddress : "",
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    return mapTurnkeyError(err);
  }
}
