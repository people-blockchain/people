/**
 * Cosmos EVM 97401: explicit gas (legacy gasPrice) — avoids maxFeePerGas=0 rejections.
 */
import { parseGwei } from "viem";

const MIN_GAS_PRICE = parseGwei("1");

export async function resolveLegacyGasFees(publicClient) {
  let gasPrice = await publicClient.getGasPrice().catch(() => MIN_GAS_PRICE);
  if (!gasPrice || gasPrice < MIN_GAS_PRICE) gasPrice = MIN_GAS_PRICE;
  const bumped = (gasPrice * 125n) / 100n;
  return { type: "legacy", gasPrice: bumped };
}

export async function estimateGasWithMargin(publicClient, estimateFn, options = {}) {
  const fallback = options.fallback ?? 400_000n;
  const minGas = options.minGas ?? 500_000n;
  try {
    const est = await estimateFn();
    if (est && est > 0n) {
      const padded = est * 2n;
      // Testnet node under-estimates (e.g. ERC20 transfer to a new holder): keep a safe floor.
      return padded > minGas ? padded : minGas;
    }
  } catch {
    /* use fallback */
  }
  const fb = fallback > minGas ? fallback : minGas;
  return fb;
}

export async function writeContractWithGas(publicClient, walletClient, params, gasOptions) {
  const fees = await resolveLegacyGasFees(publicClient);
  const account = walletClient.account;
  const gas = await estimateGasWithMargin(
    publicClient,
    () => publicClient.estimateContractGas({ ...params, account }),
    gasOptions,
  );
  return walletClient.writeContract({
    ...params,
    ...fees,
    gas,
  });
}

export async function sendTransactionWithGas(publicClient, walletClient, params) {
  const fees = await resolveLegacyGasFees(publicClient);
  const account = walletClient.account;
  let gas = params.gas;
  if (!gas) {
    gas = await estimateGasWithMargin(publicClient, () =>
      publicClient.estimateGas({ ...params, account }),
    );
  }
  return walletClient.sendTransaction({
    ...params,
    ...fees,
    gas,
  });
}
