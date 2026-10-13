// Test-only stand-in for `./chain-verify.ts`'s on-chain reads: no live RPC in this sandbox.
// `registerIssuerReferralProgram` calls `verifyTokenCreatorOnChain(token, wallet)` to check
// the caller is the token's actual on-chain `creator` (RA-WEB-N1) before registering it. Tests
// drive this by address instead of mocking a chain: any wallet enrolled via `allow(token, wallet)`
// is treated as that token's creator, everyone else is rejected, matching the real contract check.
const allowed = new Map();

export function allow(tokenAddress, walletAddress) {
  allowed.set(tokenAddress.toLowerCase(), walletAddress.toLowerCase());
}

export function reset() {
  allowed.clear();
}

export async function verifyTokenCreatorOnChain(tokenAddress, walletAddress) {
  const want = allowed.get(tokenAddress.toLowerCase());
  return Boolean(want) && want === walletAddress.toLowerCase();
}
