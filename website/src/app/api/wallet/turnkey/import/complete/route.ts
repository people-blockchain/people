import { ensurePartnerSchema } from "@/db";
import {
  completeTurnkeyPrivateKeyImport,
  describeImportCompleteConflict,
  logTurnkeyImportCompleteRejected,
  markLegacyImportFailure,
  markLegacyImportMismatch,
  sanitizeImportStage,
} from "@/lib/turnkey-import";
import { sanitizeTurnkeyError } from "@/lib/turnkey-error";
import { NextResponse } from "next/server";
import { mapTurnkeyError, NO_STORE, requireTurnkeySession } from "../../_shared";

export async function POST(request: Request) {
  const gate = await requireTurnkeySession(request, { freshAuth: true });
  if (!gate.ok) return gate.response;
  let body: {
    stampedBody?: unknown;
    stamp?: unknown;
    expectedAddress?: unknown;
    publicKey?: unknown;
    mismatch?: unknown;
    error?: unknown;
    stage?: unknown;
    encryptedBundle?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return mapTurnkeyError(new Error("invalid_address"));
  }
  try {
    await ensurePartnerSchema();
    const conflict = describeImportCompleteConflict(body);
    if (conflict) {
      logTurnkeyImportCompleteRejected(conflict);
      if (conflict.mismatch) {
        await markLegacyImportMismatch(gate.userId);
        return NextResponse.json(
          { error: "legacy_address_mismatch", stage: conflict.stage, code: conflict.reason },
          { status: 409, headers: NO_STORE },
        );
      }
      await markLegacyImportFailure(gate.userId, conflict.reason);
      return NextResponse.json(
        { error: "import_failed", stage: conflict.stage, code: conflict.reason },
        { status: 409, headers: NO_STORE },
      );
    }
    if (typeof body.encryptedBundle === "string" && body.encryptedBundle && !body.stamp) {
      return mapTurnkeyError(new Error("client_stamp_required"));
    }
    const result = await completeTurnkeyPrivateKeyImport({
      userId: gate.userId,
      expectedAddress: typeof body.expectedAddress === "string" ? body.expectedAddress : "",
      publicKey: typeof body.publicKey === "string" ? body.publicKey : undefined,
      stampedInput: body,
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    const sanitized = sanitizeTurnkeyError(err);
    logTurnkeyImportCompleteRejected({
      reason: sanitized.code,
      stage: sanitizeImportStage(body.stage) === "unknown" ? "complete" : sanitizeImportStage(body.stage),
      mismatch: false,
    });
    return mapTurnkeyError(err);
  }
}
