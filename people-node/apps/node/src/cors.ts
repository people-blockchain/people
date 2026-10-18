const DEFAULT_PUBLIC_ORIGINS = [
  "https://www.peopleblockchain.network",
  "https://peopleblockchain.network"
];

function parseCorsList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Browser CORS for a public testnet node. Compose may still set CORS_ORIGIN=*.
 *
 * Only exact origins are allowed — a `*.vercel.app` wildcard would let anyone who can
 * deploy a preview host call the node from a browser. Preview deployments must be listed
 * explicitly in `CORS_ORIGIN`.
 *
 * The public website normally uses a server-side `PEOPLE_RPC_URL` proxy, so CORS is
 * not required for that path. This allowlist covers direct browser RPC
 * (`NEXT_PUBLIC_PEOPLE_RPC_URL`) and local tools.
 */
export function isAllowedCorsOrigin(origin: string | undefined, corsOriginEnv?: string): boolean {
  if (!origin) {
    return false;
  }
  const extra = parseCorsList(corsOriginEnv ?? process.env.CORS_ORIGIN);
  if (extra.includes("*")) {
    return true;
  }
  return new Set([...DEFAULT_PUBLIC_ORIGINS, ...extra]).has(origin);
}
