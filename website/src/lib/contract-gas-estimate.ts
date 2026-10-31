import {
  APPROVED_CONTRACT_GAS_PRICE_PPL,
  APPROVED_CONTRACT_GAS_PRICE_WEI,
  TYPICAL_CONTRACT_DEPLOY_GAS,
} from "@/lib/factory-fees";

/** Mirrors `@people/core` contract gas constants (website must not import core). */
const INTRINSIC_TX_GAS = 21_000;
const CREATE_GAS = 32_000;
const CODE_DEPOSIT_GAS_PER_BYTE = 200;
export const MAX_TX_GAS_LIMIT = 4_000_000;
const GAS_LIMIT_MARGIN = 50_000;

function calldataGas(data: Uint8Array): number {
  let gas = 0;
  for (const b of data) {
    gas += b === 0 ? 4 : 16;
  }
  return gas;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error("Invalid bytecode hex");
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Conservative deploy gas estimate from compiled bytecode (intrinsic + deposit + runtime headroom). */
export function estimateContractDeployGas(bytecodeHex: string): number {
  const bytes = hexToBytes(bytecodeHex);
  const intrinsic = INTRINSIC_TX_GAS + CREATE_GAS + calldataGas(bytes);
  const deposit = bytes.length * CODE_DEPOSIT_GAS_PER_BYTE;
  const runtimeHeadroom = 120_000;
  return intrinsic + deposit + runtimeHeadroom;
}

export function defaultGasLimitFromEstimate(estimate: number): number {
  const withMargin = estimate + GAS_LIMIT_MARGIN;
  return Math.min(MAX_TX_GAS_LIMIT, Math.max(estimate, withMargin));
}

export function quoteContractFeePpl(gasLimit: number, gasPricePpl = APPROVED_CONTRACT_GAS_PRICE_PPL): number {
  return Math.round(gasLimit * gasPricePpl * 1e6) / 1e6;
}

/** Gas limit times the approved wei gas price. Display with formatPplExact. */
export function quoteContractFeeWei(gasLimit: number, gasPriceWei = APPROVED_CONTRACT_GAS_PRICE_WEI): bigint {
  if (!Number.isInteger(gasLimit) || gasLimit <= 0) return BigInt(0);
  return gasPriceWei * BigInt(gasLimit);
}

export function fallbackDeployEstimateGas(): number {
  return TYPICAL_CONTRACT_DEPLOY_GAS;
}
