import { ensurePartnerSchema } from "@/db";
import { bootstrapTurnkeySubOrg } from "@/lib/turnkey-suborg";
import { NextResponse } from "next/server";
import { mapTurnkeyError, NO_STORE, requireTurnkeySession } from "../_shared";

export async function POST(request: Request) {
  const gate = await requireTurnkeySession(request, { freshAuth: true });
  if (!gate.ok) return gate.response;
  let body: { clientPublicKey?: unknown; createWallet?: unknown } = {};
  try {
    body = (await request.json()) as { clientPublicKey?: unknown; createWallet?: unknown };
  } catch {
    return mapTurnkeyError(new Error("invalid_client_key"));
  }
  const clientPublicKey = typeof body.clientPublicKey === "string" ? body.clientPublicKey : "";
  // Default false: never mint a new address unless the client explicitly opts in.
  // Vault users must send createWallet: false and import the existing key.
  const createWallet = body.createWallet === true;
  try {
    await ensurePartnerSchema();
    const row = await bootstrapTurnkeySubOrg({
      userId: gate.userId,
      email: gate.email,
      clientPublicKey,
      createWallet,
    });
    return NextResponse.json(
      {
        subOrganizationId: row.subOrganizationId,
        turnkeyUserId: row.turnkeyUserId,
        walletId: row.walletId,
        address: row.address,
        importedFromVault: row.importedFromVault,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return mapTurnkeyError(err);
  }
}
