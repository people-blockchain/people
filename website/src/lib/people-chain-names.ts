/**
 * Public chain labels. Chain 97400 is PEOPLE Mainnet Beta — never call it a testnet.
 * Chain 97401 is the public PEOPLE development network (internal copy may say testnet).
 */
export const PEOPLE_MAINNET_BETA_CHAIN_ID = 97400;
export const PEOPLE_DEVNET_CHAIN_ID = 97401;
export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const PEOPLE_EVM_PATH = "m/44'/60'/0'/0/0";

export function peopleChainPublicName(chainId: number): string {
  if (chainId === PEOPLE_MAINNET_BETA_CHAIN_ID) return "PEOPLE Mainnet Beta";
  if (chainId === PEOPLE_DEVNET_CHAIN_ID) return "PEOPLE";
  if (chainId === BASE_MAINNET_CHAIN_ID) return "Base";
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return "Base Sepolia";
  return `Chain ${chainId}`;
}

export function peopleNativeCurrency(): { name: string; symbol: string; decimals: number } {
  return { name: "People", symbol: "PPL", decimals: 18 };
}

export const TURNKEY_EVM_CHAIN_IDS = [
  PEOPLE_MAINNET_BETA_CHAIN_ID,
  PEOPLE_DEVNET_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
] as const;

export const TURNKEY_ETHEREUM_ACCOUNT = {
  curve: "CURVE_SECP256K1" as const,
  pathFormat: "PATH_FORMAT_BIP32" as const,
  path: PEOPLE_EVM_PATH,
  addressFormat: "ADDRESS_FORMAT_ETHEREUM" as const,
};
