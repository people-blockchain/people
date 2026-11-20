import { getTurnkeyApi } from "@/lib/turnkey-server";
import { loadTurnkeyWallet } from "@/lib/turnkey-suborg";

export async function initTurnkeyEmailOtp(input: {
  userId: string;
  email: string;
  userIdentifier?: string;
}): Promise<{ otpId: string; subOrganizationId: string }> {
  const row = await loadTurnkeyWallet(input.userId);
  if (!row) throw new Error("turnkey_suborg_missing");
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("invalid_email");
  const api = await getTurnkeyApi();
  const { otpId } = await api.initOtp({
    organizationId: row.subOrganizationId,
    otpType: "OTP_TYPE_EMAIL",
    contact: email,
    userIdentifier: input.userIdentifier,
  });
  return { otpId, subOrganizationId: row.subOrganizationId };
}

export async function completeTurnkeyEmailOtp(input: {
  userId: string;
  otpId: string;
  otpCode: string;
  publicKey: string;
}): Promise<{ session: string; subOrganizationId: string }> {
  const row = await loadTurnkeyWallet(input.userId);
  if (!row) throw new Error("turnkey_suborg_missing");
  const otpCode = input.otpCode.trim();
  if (otpCode.length < 6) throw new Error("invalid_otp");
  const publicKey = input.publicKey.trim();
  if (!/^[0-9a-fA-F]{64,132}$/.test(publicKey)) throw new Error("invalid_client_key");
  const api = await getTurnkeyApi();
  const { verificationToken } = await api.verifyOtp({ otpId: input.otpId, otpCode });
  const { session } = await api.otpLogin({
    organizationId: row.subOrganizationId,
    verificationToken,
    publicKey,
    expirationSeconds: String(12 * 60 * 60),
  });
  return { session, subOrganizationId: row.subOrganizationId };
}
