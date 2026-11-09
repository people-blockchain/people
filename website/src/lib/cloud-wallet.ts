/**
 * Kill-switch for Auth.js email (Resend) / cloud-vault wallet creation & sign-in.
 * Default OFF: we do not want new custodial cloud wallets after the Web3Auth
 * incident, and Alex asked not to hold private keys for new users.
 *
 * Re-enable with NEXT_PUBLIC_CLOUD_WALLET_ENABLED=true. Existing vault rows stay
 * in Postgres; already-signed-in users can still export via WalletApp.
 * Original marketing strings are preserved under `*Cloud` locale keys.
 */
export function isCloudWalletEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_CLOUD_WALLET_ENABLED?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function preferCloudKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(preferCloudKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      if (key.endsWith("Cloud")) continue;
      const cloud = obj[`${key}Cloud`];
      if (typeof cloud === "string" && cloud.trim()) {
        out[key] = cloud;
      } else {
        out[key] = preferCloudKeys(child);
      }
    }
    return out;
  }
  return value;
}

/** When cloud wallet is enabled, overlay `fooCloud` onto `foo`. Otherwise return as-is. */
export function withCloudWalletCopy<T>(copy: T): T {
  if (!isCloudWalletEnabled()) return copy;
  return preferCloudKeys(copy) as T;
}
