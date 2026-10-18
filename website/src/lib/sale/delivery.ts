import { getNodeRpcUrl } from "@/lib/factory-config";
import { fetchAccount, signFactoryTx, submitSignedTx } from "@/lib/people-sign";

const INCLUSION_POLL_MS = 1_500;
export const DELIVERY_INCLUSION_TIMEOUT_MS = 6_000;

export function saleDeliveryKeyConfigured(): boolean {
  return Boolean(process.env.SALE_DELIVERY_PRIVATE_KEY?.trim());
}

/**
 * Whether the node has actually included this transfer in a block. The node indexes a
 * transaction only once it is applied, and `GET /transactions/:id` 404s until then, so a
 * 200 carrying a block height is the inclusion signal. Anything else (timeout, 404, an
 * error body) counts as not included: this is only ever used to hold a delivery back.
 */
export async function isDeliveryIncluded(txId: string): Promise<boolean> {
  const rpc = getNodeRpcUrl();
  try {
    const res = await fetch(`${rpc}/transactions/${encodeURIComponent(txId)}`, { cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { id?: string; blockHeight?: number } | null;
    return Boolean(body && body.id && typeof body.blockHeight === "number" && body.blockHeight > 0);
  } catch {
    return false;
  }
}

async function waitForInclusion(txId: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await isDeliveryIncluded(txId)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, INCLUSION_POLL_MS));
  }
}

export async function deliverPplToPeopleAddress(
  peopleAddress: string,
  pplAmount: number
): Promise<{ ok: true; txId: string } | { ok: false; code: string; txId?: string }> {
  const key = process.env.SALE_DELIVERY_PRIVATE_KEY?.trim();
  if (!key) {
    return { ok: false, code: "delivery_key_unconfigured" };
  }
  if (!Number.isFinite(pplAmount) || pplAmount <= 0) {
    return { ok: false, code: "invalid_amount" };
  }
  const rpc = getNodeRpcUrl();
  const account = await fetchAccount(rpc, (await import("@/lib/people-sign")).keyFromPrivate(key).address);
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID ?? "people-public-testnet-v2-2026-09-30";
  const tx = signFactoryTx(key, {
    chainId,
    id: "",
    from: "",
    to: peopleAddress.trim().toLowerCase(),
    amount: pplAmount,
    fee: 0.004875,
    nonce: account.nonce,
    timestamp: Date.now(),
    type: "transfer",
    assetId: "ppl",
    payload: { memo: "ppl-sale" },
  });
  const result = await submitSignedTx(rpc, tx);
  if (!result.accepted) {
    return { ok: false, code: result.error ?? "delivery_rejected" };
  }
  // Accepted into the mempool is not the same as delivered: the order may only be marked
  // "delivered" once the transfer is in a block. If it is still pending when the window
  // closes the tx id is returned so the caller can keep polling this same transaction
  // instead of broadcasting a second transfer for the same order.
  if (!(await waitForInclusion(tx.id, DELIVERY_INCLUSION_TIMEOUT_MS))) {
    return { ok: false, code: "delivery_pending", txId: tx.id };
  }
  return { ok: true, txId: tx.id };
}
