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
 */
export const WEB3AUTH_ID_TOKEN_JWKS_URL = "https://api-auth.web3auth.io/jwks";
export const WEB3AUTH_ID_TOKEN_ISSUER = "https://api-auth.web3auth.io";
export const WEB3AUTH_ID_TOKEN_ALGORITHM = "ES256";

export function isWeb3AuthActive(): boolean {
  return Boolean(readWeb3AuthClientId());
}
