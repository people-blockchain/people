/**
 * EVM / JSON-RPC compatibility constants (People testnet v2+).
 * Numeric chain id verified unused on https://chainid.network/chains.json (2026-10-02).
 */

/** EIP-155 chain id returned by `eth_chainId` and EVM `CHAINID` opcode. */
export const EIP155_CHAIN_ID = 97401;

/**
 * Block height at which legacy sha256-derived accounts are migrated to Ethereum addresses.
 * Coordinated upgrade: operators set this constant in a release before the chosen height.
 * `2_147_483_647` disables migration until a follow-up release lowers the height.
 */
export const EVM_ADDRESS_ACTIVATION_HEIGHT = 2_147_483_647;

/** PPL balance in `eth_getBalance`: 1 unit = 1 micro-PPL (10⁻⁶ PPL), same as EVM wei layer. */
export const EVM_NATIVE_DECIMALS_RPC = 6;
