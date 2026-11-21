import { ensurePartnerSchema } from "@/db";
import { getTurnkeyWalletStatus } from "@/lib/turnkey-suborg";
import { NextResponse } from "next/server";
import { mapTurnkeyError, NO_STORE, requireTurnkeySession } from "../../_shared";

/**
 * Confirms a fresh PEOPLE login before the browser starts Turnkey's export iframe.
 * Does not export, decrypt, or return key material.
 */
export async function POST(request: Request) {
  const gate = await requireTurnkeySession(request, { freshAuth: true });
  if (!gate.ok) return gate.response;
  try {
    await ensurePartnerSchema();
    const status = await getTurnkeyWalletStatus(gate.userId);
    if (!status.address || !status.subOrganizationId) {
      return mapTurnkeyError(new Error("turnkey_suborg_missing"));
    }
    return NextResponse.json(
      {
        address: status.address,
        subOrganizationId: status.subOrganizationId,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return mapTurnkeyError(err);
  }
}
