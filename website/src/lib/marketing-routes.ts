/** Routes where the header shows the in-app Mainnet/Testnet switch (wallet/create tools). */
const APP_TOOL_PREFIXES = ["/create", "/wallet", "/swap", "/explorer", "/staking"] as const;

export function isAppToolRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return APP_TOOL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}