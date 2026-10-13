import { NextResponse } from "next/server";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import {
  clearFounderPassportWallet,
  findFounderByWalletOrPassportWallet,
  getFounderByUserId,
  setFounderPassportWallet,
} from "@/lib/founders/service";
import { consumeFounderPassportNonce } from "@/lib/founders/passport-wallet-nonce";
import { linkPassportWalletForUser } from "@/lib/founders/passport-wallet";
import { SITE_URL } from "@/lib/site";

export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const founder = await getFounderByUserId(guard.userId);
  if (!founder) {
    return NextResponse.json({ error: "not_registered" }, { status: 403 });
  }

  let body: { nonce?: unknown; address?: unknown; signature?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.nonce !== "string" || typeof body.address !== "string" || typeof body.signature !== "string") {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const domain = (process.env.AUTH_URL?.trim() || SITE_URL).replace(/^https?:\/\//, "");
  const result = await linkPassportWalletForUser(
    {
      userId: guard.userId,
      founderNumber: founder.founderNumber,
      domain,
      nonce: body.nonce,
      address: body.address,
      signature: body.signature,
    },
    {
      consumeNonce: consumeFounderPassportNonce,
      findWalletOwner: findFounderByWalletOrPassportWallet,
      setPassportWallet: setFounderPassportWallet,
    },
  );
  if (!result.ok) {
    const status = result.error === "passport_wallet_taken" ? 409 : result.error === "invalid_input" ? 400 : 422;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, passportWallet: result.address });
}

export async function DELETE() {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;
  await clearFounderPassportWallet(guard.userId);
  return NextResponse.json({ ok: true });
}
