import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import {
  readWeb3AuthClientId,
  WEB3AUTH_ID_TOKEN_ALGORITHM,
  WEB3AUTH_ID_TOKEN_ISSUER,
  WEB3AUTH_ID_TOKEN_TRUST_ANCHORS,
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
  /** Test seam: local JWKS for the legacy `api-auth.web3auth.io` issuer. */
  keySet?: JWTVerifyGetKey;
  /** Test seam: per-issuer local JWKS, overriding the remote key set for that issuer. */
  keySets?: Record<string, JWTVerifyGetKey>;
  clientId?: string | null;
  currentDate?: Date;
};

/** Remote JWKS are cached per URL so each trust anchor is fetched at most once per process. */
const remoteKeySets = new Map<string, JWTVerifyGetKey>();

function remoteKeySetFor(jwksUrl: string): JWTVerifyGetKey {
  let keySet = remoteKeySets.get(jwksUrl);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(jwksUrl));
    remoteKeySets.set(jwksUrl, keySet);
  }
  return keySet;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Reads `iss` only to pick the trust anchor. Both helpers throw on a malformed token, which
 * the caller turns into a verification failure — an unreadable token is never trusted.
 */
function readIssuerForRouting(idToken: string): string {
  decodeProtectedHeader(idToken);
  const { iss } = decodeJwt(idToken);
  if (typeof iss !== "string" || !iss) throw new Error("id_token_unknown_issuer");
  return iss;
}

/**
 * Verifies a Web3Auth social-login idToken (ES256 signature from the JWKS paired with its
 * issuer, required `aud` = our client id, `exp`, `iat` within the replay window) and returns
 * the profile. Supports both the legacy `https://api-auth.web3auth.io` issuer and the v11
 * citadel-service issuer `web3auth.io`. Throws on any failure.
 */
export async function verifyWeb3AuthIdToken(
  idToken: string,
  options: VerifyWeb3AuthIdTokenOptions = {},
): Promise<Web3AuthProfile> {
  const clientId = options.clientId === undefined ? readWeb3AuthClientId() : options.clientId;
  if (!clientId) throw new Error("web3auth_not_configured");

  const issuer = readIssuerForRouting(idToken);
  const anchor = WEB3AUTH_ID_TOKEN_TRUST_ANCHORS.find((candidate) => candidate.issuer === issuer);
  if (!anchor) throw new Error("id_token_unknown_issuer");

  // Route the key set by the exact issuer: a token claiming `web3auth.io` must never be
  // checked against the legacy api-auth keys (or vice versa). `keySet` remains the legacy
  // test seam; `keySets` overrides any issuer by name.
  const keySet =
    options.keySets?.[issuer] ??
    (issuer === WEB3AUTH_ID_TOKEN_ISSUER ? options.keySet : undefined) ??
    remoteKeySetFor(anchor.jwksUrl);

  const { payload } = await jwtVerify(idToken, keySet, {
    algorithms: [WEB3AUTH_ID_TOKEN_ALGORITHM],
    issuer: anchor.issuer,
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

  // MetaMask Embedded Wallets v11 (Web3Auth Android SDK 11) renamed the identity claims:
  // verifier -> authConnectionId, verifierId -> userId, aggregateVerifier ->
  // groupedAuthConnectionId. The exact v11 shape is not confirmed, and legacy modal/web tokens
  // keep the old names, so accept either — preferring the legacy name when both are present.
  const verifier = optionalString(payload.verifier) ?? optionalString(payload.authConnectionId);
  const verifierId = optionalString(payload.verifierId) ?? optionalString(payload.userId);
  const aggregateVerifier =
    optionalString(payload.aggregateVerifier) ?? optionalString(payload.groupedAuthConnectionId);

  const claimAbsent = payload.email_verified === undefined;
  const verifierProvesEmailOwnership =
    GOOGLE_OR_EMAIL_PASSWORDLESS_PATTERN.test(verifier ?? "") ||
    GOOGLE_OR_EMAIL_PASSWORDLESS_PATTERN.test(aggregateVerifier ?? "");
  const emailVerified = payload.email_verified === true || (claimAbsent && verifierProvesEmailOwnership);

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

export type Web3AuthIdTokenDiagnostics = {
  kid: string | null;
  alg: string | null;
  iss: string | null;
  aud: string | string[] | null;
  claimNames: string[];
};

/**
 * Best-effort, non-throwing summary of an idToken header/payload for verification logs. Uses an
 * unverified decode and intentionally exposes only routing metadata (kid/alg/iss/aud) and the
 * sorted claim names — never the token itself, the email, or any other claim value.
 */
export function describeWeb3AuthIdTokenForLog(idToken: string): Web3AuthIdTokenDiagnostics {
  const diagnostics: Web3AuthIdTokenDiagnostics = {
    kid: null,
    alg: null,
    iss: null,
    aud: null,
    claimNames: [],
  };

  try {
    const header = decodeProtectedHeader(idToken);
    diagnostics.kid = optionalString(header.kid);
    diagnostics.alg = optionalString(header.alg);
  } catch {
    // Malformed header: return whatever was decoded (nothing here).
  }

  try {
    const payload = decodeJwt(idToken);
    diagnostics.iss = optionalString(payload.iss);
    if (typeof payload.aud === "string") {
      diagnostics.aud = payload.aud;
    } else if (Array.isArray(payload.aud)) {
      diagnostics.aud = payload.aud.filter((value): value is string => typeof value === "string");
    }
    diagnostics.claimNames = Object.keys(payload).sort();
  } catch {
    // Malformed payload: keep the header fields decoded above.
  }

  return diagnostics;
}
