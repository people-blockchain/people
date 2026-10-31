import { auth } from "@/auth";
import { ensurePartnerSchema } from "@/db";
import { clientIp } from "@/lib/discover/api-guard";
import {
  checkWalletVaultReadLimit,
  checkWalletVaultWriteLimit,
  walletVaultRateLimitedResponse,
} from "@/lib/wallet-vault-rate-limit";
import {
  createUserWalletVault,
  isWalletVaultConfigured,
  loadUserWalletVault,
} from "@/lib/wallet-cloud-server";
import { NextResponse } from "next/server";

/** Key material responses must never be cached by a shared cache or the browser disk cache. */
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export async function GET(request: Request) {
  if (!isWalletVaultConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }
  await ensurePartnerSchema();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const read = await checkWalletVaultReadLimit(session.user.id, clientIp(request));
  if (!read.allowed) return walletVaultRateLimitedResponse(read.retryAfterSeconds);
  const vault = await loadUserWalletVault(session.user.id);
  if (!vault) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json(
    {
      address: vault.address,
      publicKey: vault.publicKey,
      encryptedPrivateKey: vault.encryptedPrivateKey,
      vaultVersion: vault.vaultVersion,
    },
    { headers: NO_STORE },
  );
}

export async function PUT(request: Request) {
  if (!isWalletVaultConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }
  await ensurePartnerSchema();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const write = await checkWalletVaultWriteLimit(session.user.id, clientIp(request));
  if (!write.allowed) return walletVaultRateLimitedResponse(write.retryAfterSeconds);
  let body: { address?: string; publicKey?: string; encryptedPrivateKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  if (!body.address || !body.publicKey || !body.encryptedPrivateKey) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers: NO_STORE });
  }
  const result = await createUserWalletVault(session.user.id, {
    address: body.address,
    publicKey: body.publicKey,
    encryptedPrivateKey: body.encryptedPrivateKey,
  });
  if (!result.ok) {
    const status =
      result.error === "already_exists" ? 409 : result.error === "address_taken" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, address: result.address }, { headers: NO_STORE });
}
