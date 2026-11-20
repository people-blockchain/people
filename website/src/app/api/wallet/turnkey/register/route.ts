import { ensurePartnerSchema } from "@/db";
import { saveTurnkeyWalletAddress } from "@/lib/turnkey-suborg";
import { NextResponse } from "next/server";
import { mapTurnkeyError, NO_STORE, requireTurnkeySession } from "../_shared";

export async function POST(request: Request) {
  const gate = await requireTurnkeySession(request);
  if (!gate.ok) return gate.response;
  let body: {
    address?: unknown;
    publicKey?: unknown;
    walletId?: unknown;
    importedFromVault?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return mapTurnkeyError(new Error("invalid_address"));
  }
  try {
    await ensurePartnerSchema();
    const row = await saveTurnkeyWalletAddress({
      userId: gate.userId,
      address: typeof body.address === "string" ? body.address : "",
      publicKey: typeof body.publicKey === "string" ? body.publicKey : null,
      walletId: typeof body.walletId === "string" ? body.walletId : null,
      importedFromVault: body.importedFromVault === true,
    });
    return NextResponse.json(
      { address: row.address, subOrganizationId: row.subOrganizationId },
      { headers: NO_STORE },
    );
  } catch (err) {
    return mapTurnkeyError(err);
  }
}
