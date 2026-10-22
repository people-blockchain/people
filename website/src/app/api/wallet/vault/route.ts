import { auth } from "@/auth";
import { ensurePartnerSchema } from "@/db";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
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
  const key = `${session.user.id}:${clientIp(request)}`;
  if (!await checkSharedRateLimit("wallet-vault", key, 20, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
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
  const key = `${session.user.id}:${clientIp(request)}`;
  if (!await checkSharedRateLimit("wallet-vault", key, 20, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
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
