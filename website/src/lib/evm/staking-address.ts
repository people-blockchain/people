import { bech32 } from "@scure/base";

export const PEOPLE_VALOPER_PREFIX = "peoplevaloper";

/**
 * The staking precompile's `validators()` returns each operator as a checksummed 0x hex string,
 * but `delegate`/`undelegate`/`redelegate`/`delegation`/`unbondingDelegation` only accept the
 * bech32 `peoplevaloper1…` form (a mixed-case hex string fails bech32 decoding and the call
 * reverts), and distribution rewards are keyed by bech32 too. Normalise once at load time.
 */
export function toValoperAddress(operatorAddress: string): string {
  const hex = operatorAddress.trim().replace(/^0x/i, "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(operatorAddress.trim())) return operatorAddress.trim().toLowerCase();
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bech32.encode(PEOPLE_VALOPER_PREFIX, bech32.toWords(bytes), 90);
}
