import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import {
  readWeb3AuthClientId,
  WEB3AUTH_ID_TOKEN_ALGORITHM,
  WEB3AUTH_ID_TOKEN_ISSUER,
  WEB3AUTH_ID_TOKEN_JWKS_URL,
} from "@/lib/web3auth-config";
import { GOOGLE_OR_EMAIL_PASSWORDLESS_PATTERN } from "@/lib/web3auth-verifier-allowlist";

export type Web3AuthProfile = {
  email: string;
  name?: string | null;
  sub: string;
  verifierId: string | null;
  verifier: string | null;
  aggregateVerifier: string | null;
  /**
   * api-cron.md M1: whether the idToken proves the user owns `email`. True when the token
   * asserts `email_verified === true`, or when the claim is absent (as it always is for
   * Web3Auth v9 modal idTokens) and the verifier is Google or email-passwordless. False for
   * every other connection, which web3auth-auth.ts refuses as an email-backfill key.
   */
  emailVerified: boolean;
};

/** Allowed clock skew between Web3Auth and this server. */
export const WEB3AUTH_ID_TOKEN_CLOCK_TOLERANCE_SEC = 60;
/** Replay window: a token is accepted only shortly after it was issued (no jti store). */
export const WEB3AUTH_ID_TOKEN_MAX_AGE_SEC = 600;

export type VerifyWeb3AuthIdTokenOptions = {
  /** Test seam: local JWKS instead of the Web3Auth endpoint. */
  keySet?: JWTVerifyGetKey;
  clientId?: string | null;
  currentDate?: Date;
};

let remoteKeySet: JWTVerifyGetKey | null = null;

function web3AuthKeySet(): JWTVerifyGetKey {
  remoteKeySet ??= createRemoteJWKSet(new URL(WEB3AUTH_ID_TOKEN_JWKS_URL));
  return remoteKeySet;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Verifies a Web3Auth social-login idToken (ES256 signature from the Web3Auth JWKS,
 * `iss`, required `aud` = our client id, `exp`, `iat` within the replay window) and
 * returns the profile. Throws on any failure.
 */
export async function verifyWeb3AuthIdToken(
  idToken: string,
  options: VerifyWeb3AuthIdTokenOptions = {},
): Promise<Web3AuthProfile> {
  const clientId = options.clientId === undefined ? readWeb3AuthClientId() : options.clientId;
  if (!clientId) throw new Error("web3auth_not_configured");

  const { payload } = await jwtVerify(idToken, options.keySet ?? web3AuthKeySet(), {
    algorithms: [WEB3AUTH_ID_TOKEN_ALGORITHM],
    issuer: WEB3AUTH_ID_TOKEN_ISSUER,
    audience: clientId,
    requiredClaims: ["aud", "exp", "iat"],
    maxTokenAge: WEB3AUTH_ID_TOKEN_MAX_AGE_SEC,
    clockTolerance: WEB3AUTH_ID_TOKEN_CLOCK_TOLERANCE_SEC,
    currentDate: options.currentDate,
  });

  const email = optionalString(payload.email);
  if (!email || !email.includes("@")) throw new Error("id_token_missing_email");
  // api-cron.md M1 + the Web3Auth v9 regression: reject only an *explicit* `email_verified: false`.
  // Web3Auth's modal idTokens never emit `email_verified` at all (documented claims: iat, aud,
  // iss, email, name, profileImage, verifier, verifierId, aggregateVerifier, exp, wallets), so
  // the previous `!== true` check refused every login, including already-bound existing users.
  // An absent claim is instead trusted only when the verifier itself proves email ownership —
  // Google OAuth and the email-passwordless (OTP) connection both require the user to control
  // the mailbox. Connections whose upstream provider may report a stale/unverified address
  // (Discord/Twitter/GitHub/custom JWT, and misconfigured Google) keep yielding
  // emailVerified: false, which web3auth-auth.ts refuses for any new email binding.
  if (payload.email_verified === false) throw new Error("id_token_email_unverified");

  const verifier = optionalString(payload.verifier);
  const aggregateVerifier = optionalString(payload.aggregateVerifier);
  const claimAbsent = payload.email_verified === undefined;
  const verifierProvesEmailOwnership =
    GOOGLE_OR_EMAIL_PASSWORDLESS_PATTERN.test(verifier ?? "") ||
    GOOGLE_OR_EMAIL_PASSWORDLESS_PATTERN.test(aggregateVerifier ?? "");
  const emailVerified = payload.email_verified === true || (claimAbsent && verifierProvesEmailOwnership);

  const verifierId = optionalString(payload.verifierId);
  return {
    email,
    name: optionalString(payload.name),
    sub: optionalString(payload.sub) ?? verifierId ?? email,
    verifierId,
    verifier,
    aggregateVerifier,
    emailVerified,
  };
}
