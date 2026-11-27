import { WalletCloudError, type AuthSessionUser } from "@/lib/wallet-cloud-client";
import {
  bootstrapTurnkeyWallet,
  decryptLegacyVaultForImport,
  encryptTurnkeyOtpCode,
  fetchTurnkeyStatus,
  getTurnkeyBrowserBridge,
  importLegacyKeyIntoTurnkey,
  initTurnkeyOtp,
  loginTurnkeyOtp,
  readTurnkeyRootKey,
  registerTurnkeyAddress,
  rememberTurnkeyApiPublicKey,
  requireTurnkeyBrowserBridge,
  toTurnkeyWalletSession,
  verifyTurnkeyOtp,
  type TurnkeyWalletSession,
} from "@/lib/turnkey-client";
import { LEGACY_ADDRESS_MISMATCH, type TurnkeyImportStage } from "@/lib/turnkey-constants";
import { otpLoginSignaturePayload, turnkeyClientSignature } from "@/lib/turnkey-otp-message";
import { decideTurnkeyOpen, planTurnkeyBootstrap } from "@/lib/turnkey-upgrade";
import { warnCloudOpenFailed } from "@/lib/wallet-cloud-crypto";

export class TurnkeyOtpRequiredError extends Error {
  readonly otpId?: string;
  readonly subOrganizationId?: string;
  constructor(otpId?: string, subOrganizationId?: string) {
    super("otp_required");
    this.name = "TurnkeyOtpRequiredError";
    this.otpId = otpId;
    this.subOrganizationId = subOrganizationId;
  }
}

export class TurnkeyUpgradeRequiredError extends Error {
  readonly legacyAddress: string;
  constructor(legacyAddress: string) {
    super("upgrade_required");
    this.name = "TurnkeyUpgradeRequiredError";
    this.legacyAddress = legacyAddress;
  }
}

async function resolveClientPublicKey(
  subOrganizationId?: string | null,
): Promise<{ publicKey: string; created: boolean }> {
  const bridge = requireTurnkeyBrowserBridge();
  const existing = bridge.getApiKeyPublicKey?.()?.trim() ?? "";
  if (existing) return { publicKey: existing, created: false };
  // New tab: sessionStorage is empty, but this browser may still hold the sub-org root
  // key in IndexedDB (remembered in localStorage when it was verified).
  const root = subOrganizationId ? readTurnkeyRootKey(subOrganizationId) : "";
  if (root) return { publicKey: rememberTurnkeyApiPublicKey(root), created: false };
  const publicKey = await bridge.createApiKeyPair();
  return { publicKey, created: true };
}

/**
 * Opening a wallet is not enough to sign: Turnkey needs a live session in the kit.
 * Without one every signRawPayload / export fails with "No active session".
 * If this browser cannot create one (no root key for the sub-org), ask for email OTP.
 */
async function requireTurnkeySigningSession(subOrganizationId: string): Promise<void> {
  const bridge = requireTurnkeyBrowserBridge();
  if (!bridge.ensureSession) return;
  if (!(await bridge.ensureSession({ subOrganizationId }))) {
    throw new TurnkeyOtpRequiredError(undefined, subOrganizationId);
  }
}

const inflightOpens = new Map<string, Promise<TurnkeyWalletSession>>();

function importFailureStage(err: unknown, fallback: TurnkeyImportStage): TurnkeyImportStage {
  if (err instanceof WalletCloudError && err.stage) {
    if (err.stage === "decrypt" || err.stage === "match" || err.stage === "stamp" || err.stage === "init") {
      return err.stage;
    }
  }
  return fallback;
}

async function recordImportFailure(
  code: string,
  stage: TurnkeyImportStage,
  stampShape?: { length: number; prefix: string; format: string },
): Promise<void> {
  const mismatch = code === LEGACY_ADDRESS_MISMATCH;
  await fetch("/api/wallet/turnkey/import/complete", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(mismatch ? { mismatch: true } : {}),
      error: code,
      stage,
      ...(stampShape
        ? { stampLength: stampShape.length, stampPrefix: stampShape.prefix, stampFormat: stampShape.format }
        : {}),
    }),
  }).catch(() => undefined);
}

/**
 * Concurrent callers (session bridge + sign-in panel) share one open. Two parallel opens
 * used to create two browser keys, register one, and keep the other as "current".
 */
export function openTurnkeyWalletSession(
  user: AuthSessionUser,
  options?: { importLegacy?: boolean },
): Promise<TurnkeyWalletSession> {
  const key = `${user.id ?? ""}:${options?.importLegacy ? "import" : "open"}`;
  const pending = inflightOpens.get(key);
  if (pending) return pending;
  const run = openTurnkeyWalletSessionOnce(user, options).finally(() => {
    inflightOpens.delete(key);
  });
  inflightOpens.set(key, run);
  return run;
}

async function openTurnkeyWalletSessionOnce(
  user: AuthSessionUser,
  options?: { importLegacy?: boolean },
): Promise<TurnkeyWalletSession> {
  if (!user.id) throw new WalletCloudError("unauthorized");
  requireTurnkeyBrowserBridge();
  const status = await fetchTurnkeyStatus();
  const decision = decideTurnkeyOpen({
    hasLegacyVault: status.hasLegacyVault === true,
    legacyAddress: status.legacyAddress ?? null,
    address: status.address ?? null,
    legacyImportError: status.legacyImportError ?? null,
  });

  if (decision.action === "keep_legacy") {
    warnCloudOpenFailed({
      code: decision.reason,
      stage: "turnkey_import",
      vaultPresent: true,
      retried: false,
    });
    throw new WalletCloudError(decision.reason);
  }

  if (decision.action === "prompt_upgrade" && !options?.importLegacy) {
    throw new TurnkeyUpgradeRequiredError(decision.legacyAddress);
  }

  const { publicKey: clientPublicKey, created } = await resolveClientPublicKey(status.subOrganizationId);
  let subOrganizationId = status.subOrganizationId ?? "";
  let address = status.address ?? "";
  let turnkeyUserId = status.turnkeyUserId ?? undefined;
  let walletId = status.walletId ?? undefined;
  let publicKey = "";

  const bootstrapPlan = planTurnkeyBootstrap({
    subOrganizationId: status.subOrganizationId ?? null,
    address: status.address ?? null,
    importedFromVault: status.importedFromVault === true,
    walletId: status.walletId ?? null,
    clientKeyIsNew: created,
    decision,
  });
  if (bootstrapPlan.action === "otp") {
    // This browser key is not the sub-org root. A still-valid kit session (e.g. from an
    // earlier OTP login in another tab) is enough; otherwise ask for the email code.
    await requireTurnkeySigningSession(subOrganizationId);
  }
  if (bootstrapPlan.action === "bootstrap") {
    const createdWallet = await bootstrapTurnkeyWallet({
      clientPublicKey,
      createWallet: bootstrapPlan.createWallet,
      replaceOrphan: bootstrapPlan.replaceOrphan,
    });
    subOrganizationId = createdWallet.subOrganizationId;
    turnkeyUserId = createdWallet.turnkeyUserId ?? undefined;
    walletId = createdWallet.walletId ?? undefined;
    address = createdWallet.address ?? "";
  }

  if (options?.importLegacy && decision.action === "prompt_upgrade" && !address) {
    const decrypted = await decryptLegacyVaultForImport(user.id);
    if (!decrypted.ok) {
      const stage = decrypted.stage;
      warnCloudOpenFailed({
        code: decrypted.error,
        stage,
        vaultPresent: true,
        retried: false,
      });
      await recordImportFailure(decrypted.error, stage);
      throw new WalletCloudError(decrypted.error, { stage });
    }
    try {
      const imported = await importLegacyKeyIntoTurnkey({
        privateKey: decrypted.privateKey,
        expectedAddress: decrypted.address,
        publicKey: decrypted.publicKey,
        organizationId: subOrganizationId,
        turnkeyUserId,
      });
      address = imported.address;
      publicKey = decrypted.publicKey;
    } catch (err) {
      const code = err instanceof WalletCloudError ? err.code : "import_failed";
      const stage = importFailureStage(err, "stamp");
      const stampShape = err instanceof WalletCloudError ? err.stampShape : undefined;
      warnCloudOpenFailed({
        code,
        stage,
        vaultPresent: true,
        retried: false,
      });
      await recordImportFailure(code, stage, stampShape);
      throw err instanceof WalletCloudError ? err : new WalletCloudError("import_failed", { stage });
    }
  }

  if (!address) {
    throw new WalletCloudError("create_failed");
  }

  await requireTurnkeySigningSession(subOrganizationId);

  if (publicKey) {
    await registerTurnkeyAddress({
      address,
      publicKey,
      walletId,
      importedFromVault: decision.action === "prompt_upgrade",
    }).catch(() => undefined);
  }

  return toTurnkeyWalletSession({
    userId: user.id,
    address,
    publicKey,
    subOrganizationId,
    turnkeyUserId,
    walletId,
  });
}

export async function requestTurnkeyOtp(): Promise<{
  otpId: string;
  otpEncryptionTargetBundle: string;
  subOrganizationId: string;
  publicKey: string;
}> {
  // Always a fresh key for OTP login: it becomes a session credential, and Turnkey
  // rejects a public key that is already registered (e.g. the sub-org root key).
  const publicKey = await requireTurnkeyBrowserBridge().createApiKeyPair();
  const result = await initTurnkeyOtp();
  return { ...result, publicKey };
}

export async function completeTurnkeyOtpAndOpen(
  user: AuthSessionUser,
  input: {
    otpId: string;
    otpCode: string;
    publicKey: string;
    otpEncryptionTargetBundle: string;
  },
): Promise<TurnkeyWalletSession> {
  const bridge = requireTurnkeyBrowserBridge();
  if (!bridge.signWithApiKey) throw new WalletCloudError("turnkey_client_unready");
  const encryptedOtpBundle = await encryptTurnkeyOtpCode({
    otpCode: input.otpCode,
    otpEncryptionTargetBundle: input.otpEncryptionTargetBundle,
    publicKey: input.publicKey,
  });
  const verified = await verifyTurnkeyOtp({
    otpId: input.otpId,
    encryptedOtpBundle,
  });
  const signed = otpLoginSignaturePayload(verified.verificationToken, input.publicKey);
  const signature = await bridge.signWithApiKey({
    message: signed.message,
    publicKey: signed.publicKey,
  });
  const loggedIn = await loginTurnkeyOtp({
    verificationToken: verified.verificationToken,
    publicKey: input.publicKey,
    clientSignature: turnkeyClientSignature({
      publicKey: signed.publicKey,
      message: signed.message,
      signature,
    }),
  });
  await bridge.storeSession(loggedIn.session);
  return openTurnkeyWalletSession(user);
}

export function turnkeyOpenErrorCode(err: unknown): string {
  if (err instanceof TurnkeyOtpRequiredError) return "otp_required";
  if (err instanceof TurnkeyUpgradeRequiredError) return "upgrade_required";
  if (err instanceof WalletCloudError) return err.code;
  if (err instanceof Error && err.message === LEGACY_ADDRESS_MISMATCH) return LEGACY_ADDRESS_MISMATCH;
  return err instanceof Error ? err.message : "unknown";
}

export function hasTurnkeyBridge(): boolean {
  return Boolean(getTurnkeyBrowserBridge());
}
