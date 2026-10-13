/**
 * Address-keyed brand icons. Single source of truth for `AssetImage`, so every surface (swap,
 * tokens list, wallet, explorer) resolves the same icon for a given ERC-20 contract regardless of
 * which logical assetId (`tusdc`, the lower-cased address, etc.) that surface happens to use.
 */
export type TokenIconKind = "usdt" | "usdc";

const TOKEN_ICONS_BY_ADDRESS: Record<string, { kind: TokenIconKind; url: string }> = {
  // tUSDC — testnet mock, contracts/src/samples/TestStablecoin.sol
  "0x3578d3bedc71da9b1472eb2719aa47d98223e1ba": { kind: "usdc", url: "/tokens/usdc.svg" },
  // tUSDT — testnet mock, contracts/src/samples/TestStablecoin.sol
  "0x5f0bd878762f7df035a4c71e3d75740348a3fadc": { kind: "usdt", url: "/tokens/usdt.svg" },
};

export function tokenIconByAddress(address: string | null | undefined): { kind: TokenIconKind; url: string } | null {
  if (!address) return null;
  return TOKEN_ICONS_BY_ADDRESS[address.trim().toLowerCase()] ?? null;
}
