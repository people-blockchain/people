/** Web3Auth (Sapphire) — public Client ID; override via NEXT_PUBLIC_WEB3AUTH_CLIENT_ID in Vercel. */

export type Web3AuthNetworkName = "sapphire_devnet" | "sapphire_mainnet";

/** Owner Sapphire Mainnet project (public). Env overrides for previews / rotation. */
export const DEFAULT_WEB3AUTH_CLIENT_ID =
  "BLEizYwklbFp1syYHcNF7rMcHIQEQqJohQow_EYWRvvjFFh_r31eJYKohdC_vBR0V5Gk5-xh5AUGQCQNxLDkmG8";

export function readWeb3AuthClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID?.trim() || DEFAULT_WEB3AUTH_CLIENT_ID;
  return id || null;
}

export function readWeb3AuthNetworkName(): Web3AuthNetworkName {
  const raw = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK?.trim().toLowerCase();
  if (raw === "sapphire_mainnet" || raw === "mainnet") return "sapphire_mainnet";
  if (raw === "sapphire_devnet" || raw === "devnet") return "sapphire_devnet";
  return "sapphire_mainnet";
}

/**
 * Social-login idToken trust anchors (same for Sapphire mainnet and devnet).
 * https://docs.metamask.io/embedded-wallets/authentication/id-token/
 *
 * MetaMask Embedded Wallets v11 (Web3Auth Android SDK 11.0.1) stops using the legacy
 * `https://api-auth.web3auth.io` issuer and instead mints "citadel"-service tokens with the
 * literal issuer `web3auth.io` (no scheme), signed by keys published under
 * `https://api.web3auth.io/citadel-service/.well-known/jwks.json`. Keep both anchors: old
 * modal/web tokens still verify against the legacy endpoint. The issuer and its JWKS URL are
 * paired explicitly so a token can never be verified against the wrong service's keys.
 */
export const WEB3AUTH_ID_TOKEN_JWKS_URL = "https://api-auth.web3auth.io/jwks";
export const WEB3AUTH_ID_TOKEN_ISSUER = "https://api-auth.web3auth.io";
export const WEB3AUTH_ID_TOKEN_ALGORITHM = "ES256";

export const WEB3AUTH_CITADEL_ID_TOKEN_ISSUER = "web3auth.io";
export const WEB3AUTH_CITADEL_ID_TOKEN_JWKS_URL =
  "https://api.web3auth.io/citadel-service/.well-known/jwks.json";

export type Web3AuthIdTokenTrustAnchor = {
  issuer: string;
  jwksUrl: string;
};

export const WEB3AUTH_ID_TOKEN_TRUST_ANCHORS: readonly Web3AuthIdTokenTrustAnchor[] = [
  { issuer: WEB3AUTH_ID_TOKEN_ISSUER, jwksUrl: WEB3AUTH_ID_TOKEN_JWKS_URL },
  { issuer: WEB3AUTH_CITADEL_ID_TOKEN_ISSUER, jwksUrl: WEB3AUTH_CITADEL_ID_TOKEN_JWKS_URL },
];

export function isWeb3AuthActive(): boolean {
  return Boolean(readWeb3AuthClientId());
}
