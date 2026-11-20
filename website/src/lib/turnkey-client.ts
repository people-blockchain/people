import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { attachFactoryTxSignature, prepareFactoryTx, type UnsignedTx } from "@/lib/people-sign";
import { LEGACY_ADDRESS_MISMATCH } from "@/lib/turnkey-constants";
import { decryptPrivateKeyFromVault, VaultSchemaError, warnCloudOpenFailed } from "@/lib/wallet-cloud-crypto";
import { fetchVaultRecord, fetchWrapKey, WalletCloudError } from "@/lib/wallet-cloud-client";
import { keyFromPrivate } from "@/lib/people-sign";
import { addressMatchesPublicKey } from "@/lib/wallet-address-scheme";

const { bytesToHex, hexToBytes } = secp.etc;

export type TurnkeyWalletSession = {
  id: string;
  address: string;
  publicKey: string;
  privateKey: string;
  kind: "turnkey";
  userId: string;
  subOrganizationId: string;
  turnkeyUserId?: string;
  walletId?: string;
};

export type TurnkeyWalletStatusResponse = {
  provider: "legacy" | "turnkey";
  subOrganizationId?: string | null;
  address?: string | null;
  importedFromVault?: boolean;
  hasLegacyVault?: boolean;
  legacyAddress?: string | null;
  needsImport?: boolean;
  legacyImportError?: string | null;
};

export type TurnkeySignRawPayload = (input: {
  payload: string;
  encoding: "PAYLOAD_ENCODING_HEXADECIMAL" | "PAYLOAD_ENCODING_TEXT_UTF8";
  hashFunction: "HASH_FUNCTION_SHA256" | "HASH_FUNCTION_KECCAK256" | "HASH_FUNCTION_NO_OP";
  signWith: string;
  organizationId: string;
}) => Promise<{ r: string; s: string; v?: string }>;

export type TurnkeyBrowserBridge = {
  createApiKeyPair: () => Promise<string>;
  storeSession: (session: string) => Promise<void> | void;
  signRawPayload: TurnkeySignRawPayload;
  organizationId: string;
  httpClient?: { signRawPayload: (input: Record<string, unknown>) => Promise<unknown> };
};

let bridge: TurnkeyBrowserBridge | null = null;

export function setTurnkeyBrowserBridge(next: TurnkeyBrowserBridge | null): void {
  bridge = next;
}

export function getTurnkeyBrowserBridge(): TurnkeyBrowserBridge | null {
  return bridge;
}

export function requireTurnkeyBrowserBridge(): TurnkeyBrowserBridge {
  if (!bridge) throw new Error("turnkey_client_unready");
  return bridge;
}

export function isTurnkeySession(session: { kind?: string } | null | undefined): session is TurnkeyWalletSession {
  return session?.kind === "turnkey";
}

export function turnkeySessionId(userId: string): string {
  return `turnkey:${userId}`;
}

export function compactSignatureHex(r: string, s: string): string {
  const pad = (value: string) => value.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
  return `${pad(r)}${pad(s)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Turnkey may return `{ r, s, v }` or nest it under `activity.result.signRawPayloadResult`. */
export function parseSignRawPayload(result: unknown): { r: string; s: string; v?: string } {
  const root = asRecord(result);
  const activity = asRecord(root?.activity);
  const activityResult = asRecord(activity?.result);
  const nested =
    asRecord(activityResult?.signRawPayloadResult) ??
    asRecord(root?.signRawPayloadResult) ??
    root;
  const r = asString(nested?.r);
  const s = asString(nested?.s);
  if (!r || !s) throw new Error("turnkey_sign_failed");
  return { r, s, v: asString(nested?.v) };
}

export function recoverCompressedPublicKey(input: {
  r: string;
  s: string;
  v?: string;
  messageHashHex: string;
}): string {
  const r = input.r.replace(/^0x/i, "").padStart(64, "0");
  const s = input.s.replace(/^0x/i, "").padStart(64, "0");
  let recovery = 0;
  if (input.v) {
    const vNum = Number.parseInt(input.v.replace(/^0x/i, ""), 16);
    if (!Number.isFinite(vNum)) throw new Error("turnkey_sign_failed");
    recovery = vNum >= 27 ? (vNum - 27) % 2 : vNum % 2;
  }
  const compact = hexToBytes(`${r}${s}`);
  const hash = hexToBytes(input.messageHashHex.replace(/^0x/i, ""));
  const recoverWith = (bit: number) => {
    const recoveredFmt = new Uint8Array(65);
    recoveredFmt[0] = bit;
    recoveredFmt.set(compact, 1);
    return secp.recoverPublicKey(recoveredFmt, hash, { prehash: false, isCompressed: true });
  };
  try {
    return bytesToHex(recoverWith(recovery));
  } catch {
    return bytesToHex(recoverWith(recovery ^ 1));
  }
}

export async function signTurnkeyPeopleTx(session: TurnkeyWalletSession, tx: UnsignedTx) {
  const client = requireTurnkeyBrowserBridge();
  const { prepared, message, messageHex } = prepareFactoryTx(session.address, session.publicKey, tx);
  const signed = await client.signRawPayload({
    payload: messageHex,
    encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
    hashFunction: "HASH_FUNCTION_SHA256",
    signWith: session.address,
    organizationId: session.subOrganizationId,
  });
  let publicKey = session.publicKey;
  if (!publicKey) {
    publicKey = recoverCompressedPublicKey({
      r: signed.r,
      s: signed.s,
      v: signed.v,
      messageHashHex: bytesToHex(sha256(message)),
    });
    session.publicKey = publicKey;
    void registerTurnkeyAddress({
      address: session.address,
      publicKey,
      walletId: session.walletId,
    }).catch(() => undefined);
  }
  return attachFactoryTxSignature(prepared, publicKey, compactSignatureHex(signed.r, signed.s));
}

export async function signTurnkeyWalletMessage(session: TurnkeyWalletSession, message: string) {
  const client = requireTurnkeyBrowserBridge();
  const payloadBytes = new TextEncoder().encode(message);
  const signed = await client.signRawPayload({
    payload: message,
    encoding: "PAYLOAD_ENCODING_TEXT_UTF8",
    hashFunction: "HASH_FUNCTION_SHA256",
    signWith: session.address,
    organizationId: session.subOrganizationId,
  });
  let publicKey = session.publicKey;
  if (!publicKey) {
    publicKey = recoverCompressedPublicKey({
      r: signed.r,
      s: signed.s,
      v: signed.v,
      messageHashHex: bytesToHex(sha256(payloadBytes)),
    });
    session.publicKey = publicKey;
  }
  return {
    publicKey,
    address: session.address,
    signature: compactSignatureHex(signed.r, signed.s),
  };
}

export async function createTurnkeyEmbeddedWalletClient(session: TurnkeyWalletSession) {
  const bridge = requireTurnkeyBrowserBridge();
  if (!bridge.httpClient) throw new Error("turnkey_client_unready");
  const { createAccountWithAddress } = await import("@turnkey/viem");
  const { createWalletClient, http } = await import("viem");
  const { peopleViemChain, browserEvmRpcUrl } = await import("@/lib/evm/client");
  const account = createAccountWithAddress({
    client: bridge.httpClient as never,
    organizationId: session.subOrganizationId,
    signWith: session.address,
    ethereumAddress: session.address,
  });
  const chain = peopleViemChain(browserEvmRpcUrl());
  return createWalletClient({
    chain,
    transport: http(browserEvmRpcUrl()),
    account,
  });
}

async function jsonOrError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new WalletCloudError(typeof body.error === "string" && body.error ? body.error : fallback);
}

export async function fetchTurnkeyStatus(): Promise<TurnkeyWalletStatusResponse> {
  const res = await fetch("/api/wallet/turnkey/status", { credentials: "include", cache: "no-store" });
  if (!res.ok) await jsonOrError(res, "status_failed");
  return (await res.json()) as TurnkeyWalletStatusResponse;
}

export async function bootstrapTurnkeyWallet(input: {
  clientPublicKey: string;
  createWallet: boolean;
}): Promise<{
  subOrganizationId: string;
  turnkeyUserId?: string | null;
  walletId?: string | null;
  address?: string | null;
}> {
  const res = await fetch("/api/wallet/turnkey/bootstrap", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) await jsonOrError(res, "create_failed");
  return (await res.json()) as {
    subOrganizationId: string;
    turnkeyUserId?: string | null;
    walletId?: string | null;
    address?: string | null;
  };
}

export async function registerTurnkeyAddress(input: {
  address: string;
  publicKey?: string;
  walletId?: string;
  importedFromVault?: boolean;
}): Promise<{ address: string; subOrganizationId: string }> {
  const res = await fetch("/api/wallet/turnkey/register", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) await jsonOrError(res, "register_failed");
  return (await res.json()) as { address: string; subOrganizationId: string };
}

export async function initTurnkeyOtp(userIdentifier?: string): Promise<{ otpId: string; subOrganizationId: string }> {
  const res = await fetch("/api/wallet/turnkey/otp/init", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userIdentifier }),
  });
  if (!res.ok) await jsonOrError(res, "otp_failed");
  return (await res.json()) as { otpId: string; subOrganizationId: string };
}

export async function verifyTurnkeyOtp(input: {
  otpId: string;
  otpCode: string;
  publicKey: string;
}): Promise<{ session: string; subOrganizationId: string }> {
  const res = await fetch("/api/wallet/turnkey/otp/verify", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) await jsonOrError(res, "otp_verify_failed");
  return (await res.json()) as { session: string; subOrganizationId: string };
}

export function matchLegacyVaultKey(
  vault: { address: string },
  privateKey: string,
):
  | { ok: true; privateKey: string; address: string; publicKey: string }
  | { ok: false; error: typeof LEGACY_ADDRESS_MISMATCH | "invalid_private_key" } {
  let key;
  try {
    key = keyFromPrivate(privateKey);
  } catch {
    return { ok: false, error: "invalid_private_key" };
  }
  if (!addressMatchesPublicKey(vault.address, key.publicKey)) {
    return { ok: false, error: LEGACY_ADDRESS_MISMATCH };
  }
  return { ok: true, privateKey: key.privateKey, address: key.address, publicKey: key.publicKey };
}

export async function decryptLegacyVaultForImport(userId: string): Promise<
  | { ok: true; privateKey: string; address: string; publicKey: string }
  | { ok: false; error: typeof LEGACY_ADDRESS_MISMATCH | "decrypt_failed" | "vault_not_found" | "invalid_private_key" }
> {
  const vault = await fetchVaultRecord({ vaultPresent: true });
  if (!vault) return { ok: false, error: "vault_not_found" };
  let wrapKeyHex: string;
  try {
    wrapKeyHex = await fetchWrapKey({ vaultPresent: true });
  } catch {
    return { ok: false, error: "decrypt_failed" };
  }
  let privateKey: string;
  try {
    privateKey = await decryptPrivateKeyFromVault(vault.encryptedPrivateKey, wrapKeyHex);
  } catch (err) {
    if (err instanceof VaultSchemaError) {
      warnCloudOpenFailed({ code: "vault_schema_unsupported", stage: "turnkey_import", vaultPresent: true, retried: false });
    }
    return { ok: false, error: "decrypt_failed" };
  }
  const matched = matchLegacyVaultKey(vault, privateKey);
  if (!matched.ok) {
    if (matched.error === LEGACY_ADDRESS_MISMATCH) {
      warnCloudOpenFailed({
        code: LEGACY_ADDRESS_MISMATCH,
        stage: "turnkey_import",
        vaultPresent: true,
        retried: false,
      });
      await fetch("/api/wallet/turnkey/import/complete", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mismatch: true }),
      }).catch(() => undefined);
    }
    return matched;
  }
  void userId;
  return matched;
}

export async function encryptPrivateKeyForTurnkeyImport(input: {
  privateKey: string;
  importBundle: string;
  userId: string;
  organizationId: string;
}): Promise<string> {
  const { encryptPrivateKeyToBundle } = await import("@turnkey/crypto");
  return encryptPrivateKeyToBundle({
    privateKey: input.privateKey.replace(/^0x/i, ""),
    keyFormat: "HEXADECIMAL",
    importBundle: input.importBundle,
    userId: input.userId,
    organizationId: input.organizationId,
  });
}

export async function importLegacyKeyIntoTurnkey(input: {
  privateKey: string;
  expectedAddress: string;
}): Promise<{ address: string }> {
  const initRes = await fetch("/api/wallet/turnkey/import/init", {
    method: "POST",
    credentials: "include",
  });
  if (!initRes.ok) await jsonOrError(initRes, "import_init_failed");
  const init = (await initRes.json()) as {
    importBundle: string;
    organizationId: string;
    turnkeyUserId: string;
  };
  const encryptedBundle = await encryptPrivateKeyForTurnkeyImport({
    privateKey: input.privateKey,
    importBundle: init.importBundle,
    userId: init.turnkeyUserId,
    organizationId: init.organizationId,
  });
  const completeRes = await fetch("/api/wallet/turnkey/import/complete", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      encryptedBundle,
      expectedAddress: input.expectedAddress,
    }),
  });
  if (!completeRes.ok) await jsonOrError(completeRes, "import_failed");
  return (await completeRes.json()) as { address: string };
}

export function toTurnkeyWalletSession(input: {
  userId: string;
  address: string;
  publicKey?: string | null;
  subOrganizationId: string;
  turnkeyUserId?: string | null;
  walletId?: string | null;
}): TurnkeyWalletSession {
  return {
    id: turnkeySessionId(input.userId),
    address: input.address,
    publicKey: input.publicKey ?? "",
    privateKey: "",
    kind: "turnkey",
    userId: input.userId,
    subOrganizationId: input.subOrganizationId,
    turnkeyUserId: input.turnkeyUserId ?? undefined,
    walletId: input.walletId ?? undefined,
  };
}
