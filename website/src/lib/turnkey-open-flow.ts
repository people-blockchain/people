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
  registerTurnkeyAddress,
  requireTurnkeyBrowserBridge,
  toTurnkeyWalletSession,
  verifyTurnkeyOtp,
  type TurnkeyWalletSession,
} from "@/lib/turnkey-client";
import { LEGACY_ADDRESS_MISMATCH } from "@/lib/turnkey-constants";
import { otpLoginSignaturePayload, turnkeyClientSignature } from "@/lib/turnkey-otp-message";
import { decideTurnkeyOpen, mayCreateTurnkeyWallet } from "@/lib/turnkey-upgrade";
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

async function resolveClientPublicKey(): Promise<{ publicKey: string; created: boolean }> {
  const bridge = requireTurnkeyBrowserBridge();
  const existing = bridge.getApiKeyPublicKey?.()?.trim() ?? "";
  if (existing) return { publicKey: existing, created: false };
  const publicKey = await bridge.createApiKeyPair();
  return { publicKey, created: true };
}

async function recordImportFailure(code: string): Promise<void> {
  await fetch("/api/wallet/turnkey/import/complete", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ error: code }),
  }).catch(() => undefined);
}

export async function openTurnkeyWalletSession(
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

  const { publicKey: clientPublicKey, created } = await resolveClientPublicKey();
  let subOrganizationId = status.subOrganizationId ?? "";
  let address = status.address ?? "";
  let turnkeyUserId: string | undefined;
  let walletId: string | undefined;
  let publicKey = "";

  if (!subOrganizationId) {
    const createdWallet = await bootstrapTurnkeyWallet({
      clientPublicKey,
      createWallet: mayCreateTurnkeyWallet(decision),
    });
    subOrganizationId = createdWallet.subOrganizationId;
    turnkeyUserId = createdWallet.turnkeyUserId ?? undefined;
    walletId = createdWallet.walletId ?? undefined;
    address = createdWallet.address ?? "";
  } else if (decision.action === "use_turnkey" && created) {
    // A newly generated P-256 key is not a root of the existing sub-org.
    throw new TurnkeyOtpRequiredError();
  }

  if (options?.importLegacy && decision.action === "prompt_upgrade" && !address) {
    const decrypted = await decryptLegacyVaultForImport(user.id);
    if (!decrypted.ok) {
      warnCloudOpenFailed({
        code: decrypted.error,
        stage: "turnkey_import",
        vaultPresent: true,
        retried: false,
      });
      await recordImportFailure(decrypted.error);
      throw new WalletCloudError(decrypted.error);
    }
    try {
      const imported = await importLegacyKeyIntoTurnkey({
        privateKey: decrypted.privateKey,
        expectedAddress: decrypted.address,
      });
      address = imported.address;
      publicKey = decrypted.publicKey;
    } catch (err) {
      const code = err instanceof WalletCloudError ? err.code : "import_failed";
      warnCloudOpenFailed({
        code,
        stage: "turnkey_import",
        vaultPresent: true,
        retried: false,
      });
      await recordImportFailure(code);
      throw err instanceof WalletCloudError ? err : new WalletCloudError("import_failed");
    }
  }

  if (!address) {
    throw new WalletCloudError("create_failed");
  }

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
  const { publicKey } = await resolveClientPublicKey();
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
