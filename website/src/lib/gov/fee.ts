import type { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin.js";

/** Node's configured minimum gas price for the "appl" denom. */
const MIN_GAS_PRICE_APPL_DENOMINATOR = BigInt(10_000); // 0.0001 = 1/10000

const GAS_SAFETY_MARGIN_NUMERATOR = BigInt(13);
const GAS_SAFETY_MARGIN_DENOMINATOR = BigInt(10);

export function gasLimitWithMargin(simulatedGasUsed: bigint): bigint {
  return (simulatedGasUsed * GAS_SAFETY_MARGIN_NUMERATOR) / GAS_SAFETY_MARGIN_DENOMINATOR;
}

/** Fee at the node's minimum gas price, rounded up so the tx always clears the mempool floor. */
export function feeForGasLimit(gasLimit: bigint): Coin[] {
  const amount = (gasLimit + MIN_GAS_PRICE_APPL_DENOMINATOR - BigInt(1)) / MIN_GAS_PRICE_APPL_DENOMINATOR;
  return [{ denom: "appl", amount: amount.toString() }];
}
