/**
 * EVM gas limits and owner-approved contract gas price (PPL per gas unit).
 *
 * Approved 2026-09-29: **8.7e-7** PPL/gas. A typical ERC-20-class deploy (~1.2e6 gas)
 * prepays about **1.044** PPL at that price. This price and `DEFAULT_BLOCK_GAS_LIMIT`
 * are consensus constants — nodes must not override them via env when validating blocks.
 */

export const DEFAULT_TX_GAS_LIMIT = 2_000_000;
export const MAX_TX_GAS_LIMIT = 4_000_000;
export const DEFAULT_BLOCK_GAS_LIMIT = 20_000_000;

/** Owner-approved public tariff (2026-09-29). */
export const APPROVED_CONTRACT_GAS_PRICE_PPL = 8.7e-7;

/** Reference deploy size cited in the tariff approval (not a protocol cap). */
export const TYPICAL_CONTRACT_DEPLOY_GAS = 1_200_000;

export function quoteContractGasFeePpl(
  gasLimit: number,
  gasPricePpl = APPROVED_CONTRACT_GAS_PRICE_PPL
): number {
  return Math.round(gasLimit * gasPricePpl * 1e6) / 1e6;
}

export const TYPICAL_CONTRACT_DEPLOY_FEE_PPL = quoteContractGasFeePpl(TYPICAL_CONTRACT_DEPLOY_GAS);
