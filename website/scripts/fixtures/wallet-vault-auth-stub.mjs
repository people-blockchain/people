/** Test stand-in for `@/auth`. The vault routes only need `auth()`. */
export async function auth() {
  return globalThis.__walletVaultTestSession ?? null;
}
