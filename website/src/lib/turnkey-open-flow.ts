import { WalletCloudError, type AuthSessionUser } from "@/lib/wallet-cloud-client";
import {
  bootstrapTurnkeyWallet,
  decryptLegacyVaultForImport,
  fetchTurnkeyStatus,
  getTurnkeyBrowserBridge,
  importLegacyKeyIntoTurnkey,
  registerTurnkeyAddress,
  requireTurnkeyBrowserBridge,
  toTurnkeyWalletSession,
  type TurnkeyWalletSession,
} from "@/lib/turnkey-client";
import { LEGACY_ADDRESS_MISMATCH } from "@/lib/turnkey-constants";

export class TurnkeyOtpRequiredError extends Error {
  readonly otpId: string;
  readonly subOrganizationId: string;
  constructor(otpId: string, subOrganizationId: string) {
    super("otp_required");
    this.name = "TurnkeyOtpRequiredError";
    this.otpId = otpId;
    this.subOrganizationId = subOrganizationId;
  }
}

export async function openTurnkeyWalletSession(user: AuthSessionUser): Promise<TurnkeyWalletSession> {
  if (!user.id) throw new WalletCloudError("unauthorized");
  const bridge = requireTurnkeyBrowserBridge();
  const status = await fetchTurnkeyStatus();
  const clientPublicKey = await bridge.createApiKeyPair();
  const needsImport = status.needsImport === true;

  let subOrganizationId = status.subOrganizationId ?? "";
  let address = status.address ?? "";
  let turnkeyUserId: string | undefined;
  let walletId: string | undefined;
  let publicKey = "";

  if (!subOrganizationId) {
    const created = await bootstrapTurnkeyWallet({
      clientPublicKey,
      createWallet: !needsImport,
    });
    subOrganizationId = created.subOrganizationId;
    turnkeyUserId = created.turnkeyUserId ?? undefined;
    walletId = created.walletId ?? undefined;
    address = created.address ?? "";
  }

  if (needsImport && !address) {
    const decrypted = await decryptLegacyVaultForImport(user.id);
    if (!decrypted.ok) {
      throw new WalletCloudError(decrypted.error);
    }
    const imported = await importLegacyKeyIntoTurnkey({
      privateKey: decrypted.privateKey,
      expectedAddress: decrypted.address,
    });
    address = imported.address;
    publicKey = decrypted.publicKey;
  }

  if (!address) {
    throw new WalletCloudError("create_failed");
  }

  if (publicKey) {
    await registerTurnkeyAddress({
      address,
      publicKey,
      walletId,
      importedFromVault: needsImport,
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

export async function requestTurnkeyOtp(): Promise<{ otpId: string; subOrganizationId: string; publicKey: string }> {
  const bridge = requireTurnkeyBrowserBridge();
  const publicKey = await bridge.createApiKeyPair();
  const { initTurnkeyOtp } = await import("@/lib/turnkey-client");
  const result = await initTurnkeyOtp(publicKey);
  return { ...result, publicKey };
}

export async function completeTurnkeyOtpAndOpen(
  user: AuthSessionUser,
  input: { otpId: string; otpCode: string; publicKey: string },
): Promise<TurnkeyWalletSession> {
  const bridge = requireTurnkeyBrowserBridge();
  const { verifyTurnkeyOtp } = await import("@/lib/turnkey-client");
  const verified = await verifyTurnkeyOtp({
    otpId: input.otpId,
    otpCode: input.otpCode,
    publicKey: input.publicKey,
  });
  await bridge.storeSession(verified.session);
  return openTurnkeyWalletSession(user);
}

export function turnkeyOpenErrorCode(err: unknown): string {
  if (err instanceof TurnkeyOtpRequiredError) return "otp_required";
  if (err instanceof WalletCloudError) return err.code;
  if (err instanceof Error && err.message === LEGACY_ADDRESS_MISMATCH) return LEGACY_ADDRESS_MISMATCH;
  return err instanceof Error ? err.message : "unknown";
}

export function hasTurnkeyBridge(): boolean {
  return Boolean(getTurnkeyBrowserBridge());
}
