import { bech32 } from "@scure/base";

export const PEOPLE_BECH32_PREFIX = "people";

/** The chain derives the bech32 voter address from the same 20-byte EVM address used for eth_* calls. */
export function bech32FromEvmAddress(evmAddress: string): string {
  const hex = evmAddress.replace(/^0x/i, "");
  if (hex.length !== 40 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("invalid_evm_address");
  }
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bech32.encode(PEOPLE_BECH32_PREFIX, bech32.toWords(bytes), 90);
}
