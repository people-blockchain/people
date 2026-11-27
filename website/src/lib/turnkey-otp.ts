import { readTurnkeyOrganizationId } from "@/lib/turnkey-config";
import { getTurnkeyApi } from "@/lib/turnkey-server";
import { loadTurnkeyWallet } from "@/lib/turnkey-suborg";
import type { TurnkeyClientSignature } from "@/lib/turnkey-otp-message";

export async function initTurnkeyEmailOtp(input: {
  userId: string;
  email: string;
  userIdentifier?: string;
}): Promise<{ otpId: string; otpEncryptionTargetBundle: string; subOrganizationId: string }> {
  const row = await loadTurnkeyWallet(input.userId);
  if (!row) throw new Error("turnkey_suborg_missing");
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("invalid_email");
  const api = await getTurnkeyApi();
  // INIT_OTP_V3 / VERIFY_OTP_V2 are parent-org activities. Targeting the sub-org fails with
  // REQUEST_NOT_AUTHORIZED: the parent API key is not a credential inside the sub-org.
  // OTP_LOGIN_V2 below still targets the user's sub-org.
  const { otpId, otpEncryptionTargetBundle } = await api.initOtp({
    organizationId: readTurnkeyOrganizationId(),
    otpType: "OTP_TYPE_EMAIL",
    contact: email,
    userIdentifier: input.userIdentifier,
  });
  return { otpId, otpEncryptionTargetBundle, subOrganizationId: row.subOrganizationId };
}

export async function verifyTurnkeyEmailOtp(input: {
  userId: string;
  otpId: string;
  encryptedOtpBundle: string;
}): Promise<{ verificationToken: string; subOrganizationId: string }> {
  const row = await loadTurnkeyWallet(input.userId);
  if (!row) throw new Error("turnkey_suborg_missing");
  const encryptedOtpBundle = input.encryptedOtpBundle.trim();
  if (!encryptedOtpBundle) throw new Error("invalid_otp");
  const api = await getTurnkeyApi();
  const { verificationToken } = await api.verifyOtp({
    otpId: input.otpId,
    encryptedOtpBundle,
  });
  return { verificationToken, subOrganizationId: row.subOrganizationId };
}

export async function loginTurnkeyEmailOtp(input: {
  userId: string;
  verificationToken: string;
  publicKey: string;
  clientSignature: TurnkeyClientSignature;
}): Promise<{ session: string; subOrganizationId: string }> {
  const row = await loadTurnkeyWallet(input.userId);
  if (!row) throw new Error("turnkey_suborg_missing");
  const publicKey = input.publicKey.trim();
  if (!/^[0-9a-fA-F]{64,132}$/.test(publicKey)) throw new Error("invalid_client_key");
  if (!input.verificationToken.trim()) throw new Error("invalid_otp");
  if (!input.clientSignature.signature.trim()) throw new Error("invalid_otp");
  const api = await getTurnkeyApi();
  const { session } = await api.otpLogin({
    organizationId: row.subOrganizationId,
    verificationToken: input.verificationToken,
    publicKey,
    clientSignature: input.clientSignature,
    expirationSeconds: String(12 * 60 * 60),
  });
  return { session, subOrganizationId: row.subOrganizationId };
}
