import { isTurnkeyWalletProvider } from "@/lib/wallet-provider-flag";

export const TURNKEY_API_BASE_URL = "https://api.turnkey.com";

/** Parent organization. Not a secret; override with TURNKEY_ORGANIZATION_ID. */
export const DEFAULT_TURNKEY_ORGANIZATION_ID = "6ffc9541-4400-4c4b-8839-19fbc332a91b";

export type TurnkeyServerConfig = {
  apiBaseUrl: string;
  organizationId: string;
  apiPublicKey: string;
  apiPrivateKey: string;
};

function trimmed(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function readTurnkeyOrganizationId(): string {
  return (
    trimmed("TURNKEY_ORGANIZATION_ID") ||
    trimmed("NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID") ||
    DEFAULT_TURNKEY_ORGANIZATION_ID
  );
}

export function readPublicTurnkeyOrganizationId(): string {
  return (
    trimmed("NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID") ||
    trimmed("TURNKEY_ORGANIZATION_ID") ||
    DEFAULT_TURNKEY_ORGANIZATION_ID
  );
}

export function readTurnkeyApiBaseUrl(): string {
  return trimmed("TURNKEY_API_BASE_URL") || TURNKEY_API_BASE_URL;
}

export function isTurnkeyConfigured(): boolean {
  return Boolean(
    readTurnkeyOrganizationId() &&
      trimmed("TURNKEY_API_PUBLIC_KEY") &&
      trimmed("TURNKEY_API_PRIVATE_KEY"),
  );
}

/** Ready to serve Turnkey wallet APIs: flag on, keys present, database present. */
export function isTurnkeyWalletReady(): boolean {
  return isTurnkeyWalletProvider() && isTurnkeyConfigured() && Boolean(process.env.DATABASE_URL?.trim());
}

export function readTurnkeyServerConfig(): TurnkeyServerConfig {
  const organizationId = readTurnkeyOrganizationId();
  const apiPublicKey = trimmed("TURNKEY_API_PUBLIC_KEY");
  const apiPrivateKey = trimmed("TURNKEY_API_PRIVATE_KEY");
  if (!organizationId || !apiPublicKey || !apiPrivateKey) {
    throw new Error("turnkey_not_configured");
  }
  return {
    apiBaseUrl: readTurnkeyApiBaseUrl(),
    organizationId,
    apiPublicKey,
    apiPrivateKey,
  };
}
