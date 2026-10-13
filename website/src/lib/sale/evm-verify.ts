import { createPublicClient, decodeEventLog, http, parseAbiItem } from "viem";
import { bsc, base, mainnet, polygon } from "viem/chains";
import type { SaleNetworkId, SaleStable } from "./networks";
import { getSaleNetwork } from "./networks";

const purchasedEvent = parseAbiItem(
  "event Purchased(address indexed buyer, address indexed beneficiary, uint256 usdtPaid, uint256 pplOut, uint256 soldAfter)"
);

function chainFor(networkId: SaleNetworkId) {
  switch (networkId) {
    case "bsc":
      return bsc;
    case "base":
      return base;
    case "ethereum":
      return mainnet;
    case "polygon":
      return polygon;
    default:
      return null;
  }
}

export async function verifyEvmSaleTx(
  networkId: SaleNetworkId,
  stable: SaleStable,
  txHash: `0x${string}`,
  expectedBeneficiary: string,
  minPplOut: number,
  orderCreatedAtMs: number,
  orderExpiresAtMs?: number
): Promise<{ ok: true; usdtPaid: number; pplOut: number } | { ok: false; code: string }> {
  const network = getSaleNetwork(networkId);
  if (!network?.evm?.saleContract) return { ok: false, code: "contract_unconfigured" };
  const stableDecimals = network.evm[stable]?.decimals;
  if (!stableDecimals) return { ok: false, code: "stable_unconfigured" };
  const chain = chainFor(networkId);
  if (!chain) return { ok: false, code: "unsupported_evm_network" };
  const rpc =
    process.env[`SALE_RPC_${networkId.toUpperCase()}`]?.trim() ||
    chain.rpcUrls.default.http[0];
  const client = createPublicClient({ chain, transport: http(rpc) });
  const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt || receipt.status !== "success") {
    return { ok: false, code: "tx_not_confirmed" };
  }
  const saleContract = network.evm.saleContract.toLowerCase();
  // WEB-M4: the receipt must come from the configured sale contract. Decoding the ABI event
  // below already filters by log address, but a tx that only *calls* some other contract which
  // happens to emit a matching log is not a purchase — check the real recipient up front.
  if ((receipt.to ?? "").toLowerCase() !== saleContract) {
    return { ok: false, code: "wrong_contract" };
  }
  const confirmations = network.confirmations;
  const head = await client.getBlockNumber();
  if (head - receipt.blockNumber + BigInt(1) < BigInt(confirmations)) {
    return { ok: false, code: "awaiting_confirmations" };
  }
  // A purchase from before the order existed cannot be the payment for this order
  // (prevents replaying an old tx hash against a freshly created order).
  const block = await client.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null);
  if (!block || Number(block.timestamp) * 1000 < orderCreatedAtMs) {
    return { ok: false, code: "tx_before_order" };
  }
  // ...and a purchase mined after the quote expired is not the payment for this order either,
  // so a payment made after the window cannot be attached to a stale (cheaper) quote.
  if (orderExpiresAtMs !== undefined && Number(block.timestamp) * 1000 > orderExpiresAtMs) {
    return { ok: false, code: "tx_after_expiry" };
  }
  const beneficiary = expectedBeneficiary.toLowerCase() as `0x${string}`;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== saleContract) continue;
    try {
      const decoded = decodeEventLog({ abi: [purchasedEvent], data: log.data, topics: log.topics });
      if (decoded.eventName !== "Purchased") continue;
      const args = decoded.args as {
        beneficiary: `0x${string}`;
        usdtPaid: bigint;
        pplOut: bigint;
      };
      if (args.beneficiary.toLowerCase() !== beneficiary) {
        return { ok: false, code: "beneficiary_mismatch" };
      }
      const pplOut = Number(args.pplOut);
      if (pplOut < minPplOut) return { ok: false, code: "ppl_too_low" };
      const usdtPaid = Number(args.usdtPaid) / 10 ** stableDecimals;
      return { ok: true, usdtPaid, pplOut };
    } catch {
      /* try next log */
    }
  }
  return { ok: false, code: "purchase_event_missing" };
}
