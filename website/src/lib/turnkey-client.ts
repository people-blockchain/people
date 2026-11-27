import * as secp from "@noble/secp256k1";
import { getAddress } from "viem";
import { sha256 } from "@noble/hashes/sha2.js";
import { attachFactoryTxSignature, prepareFactoryTx, type UnsignedTx } from "@/lib/people-sign";
import {
  LEGACY_ADDRESS_MISMATCH,
  TURNKEY_API_PUBKEY_STORAGE_KEY,
  TURNKEY_ROOT_PUBKEY_STORAGE_PREFIX,
} from "@/lib/turnkey-constants";
import {
  buildInitImportActivity,
  buildImportPrivateKeyActivity,
  coerceTurnkeyP256SignatureToDerHex,
  describeStampSignatureShape,
  encodeTurnkeyApiStamp,
  parseTurnkeyApiStamp,
} from "@/lib/turnkey-stamp";
import { decryptPrivateKeyFromVault, VaultSchemaError, warnCloudOpenFailed } from "@/lib/wallet-cloud-crypto";
import { fetchVaultRecord, fetchWrapKey, WalletCloudError } from "@/lib/wallet-cloud-client";
import { keyFromPrivate } from "@/lib/people-sign";
import { addressMatchesPublicKey } from "@/lib/wallet-address-scheme";
import type { TurnkeyImportStage } from "@/lib/turnkey-constants";

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
  turnkeyUserId?: string | null;
  walletId?: string | null;
  address?: string | null;
  importedFromVault?: boolean;
  hasLegacyVault?: boolean;
  legacyAddress?: string | null;
  needsImport?: boolean;
  addressConflict?: boolean;
  legacyImportError?: string | null;
  orphanSubOrg?: boolean;
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
  signWithApiKey?: (input: { message: string; publicKey?: string }) => Promise<string>;
  /** Official kit IndexedDB stamper: returns X-Stamp header value for the sub-org root. */
  stampActivity?: (payload: string) => Promise<string>;
  getApiKeyPublicKey?: () => string | null;
  exportWalletAccount?: (input: { address: string; organizationId: string }) => Promise<void>;
  /** Opens the Turnkey export modal for an imported (vault-upgraded) private key. */
  exportPrivateKey?: (input: { address: string; organizationId: string }) => Promise<boolean>;
  /**
   * Makes sure the Turnkey kit holds a live session for `subOrganizationId`, so
   * `signRawPayload` / export can be stamped. Creates one with STAMP_LOGIN from the
   * sub-org root API key stored in this browser. Returns false when this browser
   * holds no root key for the sub-org (the caller must fall back to email OTP).
   */
  ensureSession?: (input: { subOrganizationId: string }) => Promise<boolean>;
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
  if (!bridge) throw new WalletCloudError("turnkey_client_unready");
  return bridge;
}

let rememberedApiPublicKey = "";

export function rememberTurnkeyApiPublicKey(publicKey: string): string {
  const next = publicKey.trim().replace(/^0x/i, "");
  if (!next) throw new WalletCloudError("stamp_no_key", { stage: "stamp" });
  rememberedApiPublicKey = next;
  try {
    sessionStorage.setItem(TURNKEY_API_PUBKEY_STORAGE_KEY, next);
  } catch {
    /* sessionStorage may be unavailable; IndexedDB still holds the non-extractable key. */
  }
  return next;
}

/** Clears only the in-memory copy so a subsequent read must go to sessionStorage (reload). */
export function forgetTurnkeyApiPublicKeyMemory(): void {
  rememberedApiPublicKey = "";
}

export function readTurnkeyApiPublicKey(): string {
  if (rememberedApiPublicKey) return rememberedApiPublicKey;
  try {
    const stored = sessionStorage.getItem(TURNKEY_API_PUBKEY_STORAGE_KEY)?.trim() ?? "";
    if (stored) rememberedApiPublicKey = stored.replace(/^0x/i, "");
  } catch {
    /* ignore */
  }
  return rememberedApiPublicKey;
}

/**
 * Turnkey matches `signWith` / export addresses case-sensitively against the EIP-55
 * checksum form. PEOPLE stores addresses lowercased, so always convert before calling
 * Turnkey ("Could not find any resource to sign with. Addresses are case sensitive.").
 */
export function turnkeyAddress(address: string): string {
  const trimmed = address.trim();
  try {
    return getAddress(trimmed);
  } catch {
    return trimmed;
  }
}

function rootKeyStorageKey(subOrganizationId: string): string {
  return `${TURNKEY_ROOT_PUBKEY_STORAGE_PREFIX}${subOrganizationId.trim()}`;
}

/**
 * The sub-org root P-256 key lives (non-extractable) in IndexedDB, which persists across
 * tabs. Remember which public key is the root for a sub-org in localStorage, so a new tab
 * can open a Turnkey session without a new email code. Public key only, not a secret.
 */
export function rememberTurnkeyRootKey(subOrganizationId: string, publicKey: string): void {
  const sub = subOrganizationId.trim();
  const key = publicKey.trim().replace(/^0x/i, "");
  if (!sub || !key) return;
  try {
    localStorage.setItem(rootKeyStorageKey(sub), key);
  } catch {
    /* localStorage may be unavailable */
  }
}

export function readTurnkeyRootKey(subOrganizationId: string): string {
  const sub = subOrganizationId.trim();
  if (!sub) return "";
  try {
    return localStorage.getItem(rootKeyStorageKey(sub))?.trim() ?? "";
  } catch {
    return "";
  }
}

export function forgetTurnkeyRootKey(subOrganizationId: string): void {
  try {
    localStorage.removeItem(rootKeyStorageKey(subOrganizationId));
  } catch {
    /* ignore */
  }
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
    signWith: turnkeyAddress(session.address),
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
    signWith: turnkeyAddress(session.address),
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
    signWith: turnkeyAddress(session.address),
    ethereumAddress: turnkeyAddress(session.address),
  });
  const chain = peopleViemChain(browserEvmRpcUrl());
  return createWalletClient({
    chain,
    transport: http(browserEvmRpcUrl()),
    account,
  });
}

async function jsonOrError(res: Response, fallback: string, stage?: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new WalletCloudError(typeof body.error === "string" && body.error ? body.error : fallback, {
    stage,
  });
}

export async function fetchTurnkeyStatus(): Promise<TurnkeyWalletStatusResponse> {
  const res = await fetch("/api/wallet/turnkey/status", { credentials: "include", cache: "no-store" });
  if (!res.ok) await jsonOrError(res, "status_failed");
  return (await res.json()) as TurnkeyWalletStatusResponse;
}

export async function bootstrapTurnkeyWallet(input: {
  clientPublicKey: string;
  createWallet: boolean;
  replaceOrphan?: boolean;
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

export async function initTurnkeyOtp(userIdentifier?: string): Promise<{
  otpId: string;
  otpEncryptionTargetBundle: string;
  subOrganizationId: string;
}> {
  const res = await fetch("/api/wallet/turnkey/otp/init", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userIdentifier }),
  });
  if (!res.ok) await jsonOrError(res, "otp_failed");
  return (await res.json()) as {
    otpId: string;
    otpEncryptionTargetBundle: string;
    subOrganizationId: string;
  };
}

export async function verifyTurnkeyOtp(input: {
  otpId: string;
  encryptedOtpBundle: string;
}): Promise<{ verificationToken: string; subOrganizationId: string }> {
  const res = await fetch("/api/wallet/turnkey/otp/verify", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) await jsonOrError(res, "otp_verify_failed");
  return (await res.json()) as { verificationToken: string; subOrganizationId: string };
}

export async function loginTurnkeyOtp(input: {
  verificationToken: string;
  publicKey: string;
  clientSignature: {
    publicKey: string;
    scheme: "CLIENT_SIGNATURE_SCHEME_API_P256";
    message: string;
    signature: string;
  };
}): Promise<{ session: string; subOrganizationId: string }> {
  const res = await fetch("/api/wallet/turnkey/otp/login", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) await jsonOrError(res, "otp_verify_failed");
  return (await res.json()) as { session: string; subOrganizationId: string };
}

export async function encryptTurnkeyOtpCode(input: {
  otpCode: string;
  otpEncryptionTargetBundle: string;
  publicKey: string;
}): Promise<string> {
  const { encryptOtpCodeToBundle } = await import("@turnkey/crypto");
  return encryptOtpCodeToBundle(input.otpCode, input.otpEncryptionTargetBundle, input.publicKey);
}

export async function confirmTurnkeyExportReady(): Promise<{ address: string; subOrganizationId: string }> {
  const res = await fetch("/api/wallet/turnkey/export/ready", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) await jsonOrError(res, "reauth_required");
  return (await res.json()) as { address: string; subOrganizationId: string };
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
  // Keep the vault address (legacy sha256 or keccak). key.address follows the live scheme and
  // must not replace a funded vault row.
  return {
    ok: true,
    privateKey: key.privateKey,
    address: vault.address.trim().toLowerCase(),
    publicKey: key.publicKey,
  };
}

function wrapKeyFailureCode(err: unknown): "decrypt_failed" | "reauth_required" | "wrap_key_failed" {
  if (err instanceof WalletCloudError) {
    if (err.code === "reauth_required") return "reauth_required";
    if (err.code === "wrap_key_failed" || err.code === "unauthorized") return "wrap_key_failed";
  }
  return "decrypt_failed";
}

export async function decryptLegacyVaultForImport(userId: string): Promise<
  | { ok: true; privateKey: string; address: string; publicKey: string }
  | {
      ok: false;
      error:
        | typeof LEGACY_ADDRESS_MISMATCH
        | "decrypt_failed"
        | "vault_not_found"
        | "invalid_private_key"
        | "reauth_required"
        | "wrap_key_failed";
      stage: TurnkeyImportStage;
    }
> {
  // Wrap-key first: GET wrap-key may migrate the vault row. Fetching ciphertext before that
  // (the previous order) decrypts the old blob with the post-migration key.
  let wrapKeyHex: string;
  try {
    wrapKeyHex = await fetchWrapKey({ vaultPresent: true });
  } catch (err) {
    return { ok: false, error: wrapKeyFailureCode(err), stage: "decrypt" };
  }
  let vault;
  try {
    vault = await fetchVaultRecord({ vaultPresent: true });
  } catch {
    return { ok: false, error: "decrypt_failed", stage: "decrypt" };
  }
  if (!vault) return { ok: false, error: "vault_not_found", stage: "decrypt" };
  let privateKey: string;
  try {
    privateKey = await decryptPrivateKeyFromVault(vault.encryptedPrivateKey, wrapKeyHex);
  } catch (err) {
    if (err instanceof VaultSchemaError) {
      warnCloudOpenFailed({
        code: "vault_schema_unsupported",
        stage: "decrypt",
        vaultPresent: true,
        retried: false,
      });
    }
    return { ok: false, error: "decrypt_failed", stage: "decrypt" };
  }
  const matched = matchLegacyVaultKey(vault, privateKey);
  if (!matched.ok) {
    return { ...matched, stage: matched.error === LEGACY_ADDRESS_MISMATCH ? "match" : "decrypt" };
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

function stampFailureCode(err: unknown): string {
  if (err instanceof WalletCloudError) return err.code;
  const message = err instanceof Error ? err.message : "";
  if (message === "invalid_stamp" || message === "invalid_client_key") return message;
  if (/key not found|no active session|not initialized/i.test(message)) return "stamp_no_key";
  return "stamp_failed";
}

function stampError(code: string, signature: unknown): WalletCloudError {
  let shape = describeStampSignatureShape(signature);
  if (typeof signature === "string" && signature.length >= 16) {
    try {
      shape = describeStampSignatureShape(parseTurnkeyApiStamp(signature).signature);
    } catch {
      /* keep the outer encoding shape */
    }
  }
  return new WalletCloudError(code, { stage: "stamp", stampShape: shape });
}

export async function stampTurnkeyActivityBody(body: object): Promise<{ stampedBody: string; stamp: string }> {
  const bridge = requireTurnkeyBrowserBridge();
  const publicKey =
    bridge.getApiKeyPublicKey?.()?.trim().replace(/^0x/i, "") || readTurnkeyApiPublicKey();
  if (!publicKey) throw stampError("stamp_no_key", "");
  rememberTurnkeyApiPublicKey(publicKey);
  const stampedBody = JSON.stringify(body);

  if (bridge.stampActivity) {
    let header = "";
    try {
      header = await bridge.stampActivity(stampedBody);
      parseTurnkeyApiStamp(header);
      return { stampedBody, stamp: header };
    } catch (err) {
      throw stampError(stampFailureCode(err), header);
    }
  }

  if (!bridge.signWithApiKey) throw stampError("stamp_unready", "");
  let signature: unknown;
  try {
    signature = await bridge.signWithApiKey({ message: stampedBody, publicKey });
  } catch (err) {
    throw stampError(stampFailureCode(err), "");
  }
  try {
    const der = coerceTurnkeyP256SignatureToDerHex(signature);
    return { stampedBody, stamp: encodeTurnkeyApiStamp({ publicKey, signature: der }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid_stamp";
    throw stampError(message === "invalid_client_key" ? "stamp_bad_key" : "invalid_stamp", signature);
  }
}

export async function importLegacyKeyIntoTurnkey(input: {
  privateKey: string;
  expectedAddress: string;
  publicKey?: string;
  organizationId?: string;
  turnkeyUserId?: string;
}): Promise<{ address: string }> {
  let organizationId = input.organizationId?.trim() ?? "";
  let turnkeyUserId = input.turnkeyUserId?.trim() ?? "";
  if (!organizationId || !turnkeyUserId) {
    const metaRes = await fetch("/api/wallet/turnkey/import/init", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!metaRes.ok) await jsonOrError(metaRes, "import_init_failed", "init");
    const meta = (await metaRes.json()) as { organizationId?: string; turnkeyUserId?: string };
    organizationId = meta.organizationId?.trim() ?? "";
    turnkeyUserId = meta.turnkeyUserId?.trim() ?? "";
  }
  if (!organizationId || !turnkeyUserId) {
    throw new WalletCloudError("turnkey_user_missing", { stage: "init" });
  }

  const initStamp = await stampTurnkeyActivityBody(
    buildInitImportActivity({ organizationId, userId: turnkeyUserId }),
  );
  const initRes = await fetch("/api/wallet/turnkey/import/init", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(initStamp),
  });
  if (!initRes.ok) await jsonOrError(initRes, "import_init_failed", "init");
  const init = (await initRes.json()) as {
    importBundle?: string;
    organizationId: string;
    turnkeyUserId: string;
  };
  if (!init.importBundle) throw new WalletCloudError("import_init_failed", { stage: "init" });
  const encryptedBundle = await encryptPrivateKeyForTurnkeyImport({
    privateKey: input.privateKey,
    importBundle: init.importBundle,
    userId: init.turnkeyUserId,
    organizationId: init.organizationId,
  });
  const importStamp = await stampTurnkeyActivityBody(
    buildImportPrivateKeyActivity({
      organizationId: init.organizationId,
      userId: init.turnkeyUserId,
      encryptedBundle,
    }),
  );
  const completeRes = await fetch("/api/wallet/turnkey/import/complete", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...importStamp,
      expectedAddress: input.expectedAddress,
      publicKey: input.publicKey,
      stage: "init",
    }),
  });
  if (!completeRes.ok) await jsonOrError(completeRes, "import_failed", "init");
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
