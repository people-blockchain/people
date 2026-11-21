function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }
  if (typeof atob === "function") return atob(padded);
  throw new Error("invalid_otp");
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("invalid_otp");
  try {
    const parsed = asRecord(JSON.parse(decodeBase64Url(parts[1])) as unknown);
    if (!parsed) throw new Error("invalid_otp");
    return parsed;
  } catch {
    throw new Error("invalid_otp");
  }
}

/**
 * OTP_LOGIN_V2 clientSignature message. Matches Turnkey
 * `getClientSignatureMessageForLogin` without importing the wallet kit.
 */
export function otpLoginSignaturePayload(
  verificationToken: string,
  sessionPublicKey: string,
): { message: string; publicKey: string } {
  const publicKey = sessionPublicKey.trim();
  if (!/^[0-9a-fA-F]{64,132}$/.test(publicKey)) throw new Error("invalid_client_key");
  const decoded = decodeJwtPayload(verificationToken);
  const tokenId = typeof decoded.id === "string" ? decoded.id.trim() : "";
  if (!tokenId) throw new Error("invalid_otp");
  const message = JSON.stringify({
    login: { publicKey },
    tokenId,
    type: "USAGE_TYPE_LOGIN",
  });
  return { message, publicKey };
}

export type TurnkeyClientSignature = {
  publicKey: string;
  scheme: "CLIENT_SIGNATURE_SCHEME_API_P256";
  message: string;
  signature: string;
};

export function turnkeyClientSignature(input: {
  publicKey: string;
  message: string;
  signature: string;
}): TurnkeyClientSignature {
  return {
    publicKey: input.publicKey,
    scheme: "CLIENT_SIGNATURE_SCHEME_API_P256",
    message: input.message,
    signature: input.signature,
  };
}
