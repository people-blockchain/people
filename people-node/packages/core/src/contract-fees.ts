/**
 * EVM gas billing in PPL. Gas price and block gas limit are **consensus constants**
 * from `@ovn/protocol` — not per-node env overrides (env forks the network).
 */

import {
  APPROVED_CONTRACT_GAS_PRICE_PPL,
  DEFAULT_BLOCK_GAS_LIMIT,
  DEFAULT_TX_GAS_LIMIT,
  MAX_TX_GAS_LIMIT,
  quoteContractGasFeePpl
} from "@ovn/protocol";

export {
  APPROVED_CONTRACT_GAS_PRICE_PPL,
  DEFAULT_TX_GAS_LIMIT,
  MAX_TX_GAS_LIMIT,
  DEFAULT_BLOCK_GAS_LIMIT,
  TYPICAL_CONTRACT_DEPLOY_GAS,
  TYPICAL_CONTRACT_DEPLOY_FEE_PPL,
  quoteContractGasFeePpl
} from "@ovn/protocol";

/** @deprecated Use `APPROVED_CONTRACT_GAS_PRICE_PPL`. */
export const PROPOSED_CONTRACT_GAS_PRICE_PPL = APPROVED_CONTRACT_GAS_PRICE_PPL;

export const INTRINSIC_TX_GAS = 21_000;
export const CREATE_GAS = 32_000;
export const CODE_DEPOSIT_GAS_PER_BYTE = 200;

export function contractGasPricePpl(): number {
  return APPROVED_CONTRACT_GAS_PRICE_PPL;
}

export function contractBlockGasLimit(): number {
  return DEFAULT_BLOCK_GAS_LIMIT;
}

export function pplFromGas(gasUsed: number, gasPrice = contractGasPricePpl()): number {
  return quoteContractGasFeePpl(gasUsed, gasPrice);
}

export function quoteContractFeePpl(gasLimit: number, gasPrice = contractGasPricePpl()): number {
  return quoteContractGasFeePpl(gasLimit, gasPrice);
}
