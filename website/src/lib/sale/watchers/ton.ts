import { saleReceiverFromEnv } from "@/lib/sale/networks";

/** Official Tether USD jetton master contract on TON mainnet; 6 decimals. */
export const USDT_JETTON_MASTER_TON = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

type JettonTransfer = {
  source?: string;
  destination?: string;
  jetton_master?: string;
  amount?: string;
  transaction_hash?: string;
  transaction_now?: number;
  transaction_aborted?: boolean;
  decoded_forward_payload?: { "@type"?: string; comment?: string } | null;
};

/**
 * TON "user-friendly" (base64/base64url) or raw `wc:hex` address -> normalized `wc:hex`
 * (lowercase). Exported so order creation (service.ts) can store `payerAddress` in the same
 * canonical form this watcher extracts `from` in — M05-7 payer binding only works if both
 * sides compare equal.
 */
export function tonAddressToRaw(address: string): string | null {
  const trimmed = address.trim();
  if (trimmed.includes(":")) {
    const [wc, hash] = trimmed.split(":");
    if (!/^-?\d+$/.test(wc) || !/^[0-9a-fA-F]{64}$/.test(hash)) return null;
    return `${Number(wc)}:${hash.toLowerCase()}`;
  }
  const b64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, "base64");
  } catch {
    return null;
  }
  if (bytes.length !== 36) return null;
  const workchain = bytes.readInt8(1);
  const hash = bytes.subarray(2, 34).toString("hex");
  return `${workchain}:${hash}`;
}

/**
 * Confirmed incoming USDT jetton transfers to the sale receiver. Native TON transfers are
 * never counted as payment: USDT on TON is a jetton, so only `transfer_notification`-backed
 * transfers reported by the indexer for the USDT jetton master, to our receiver, count.
 */
export async function fetchTonIncoming(limit = 30): Promise<
  { txId: string; amountMicro: bigint; memo: string | null; timestamp: number; from: string | null }[]
> {
  const receiver = saleReceiverFromEnv("ton");
  if (!receiver) return [];
  const receiverRaw = tonAddressToRaw(receiver);
  const masterRaw = tonAddressToRaw(USDT_JETTON_MASTER_TON);
  if (!receiverRaw || !masterRaw) return [];
  const url =
    `https://toncenter.com/api/v3/jetton/transfers?owner_address=${encodeURIComponent(receiver)}` +
    `&jetton_master=${encodeURIComponent(USDT_JETTON_MASTER_TON)}&direction=in&limit=${limit}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return [];
  const body = (await res.json()) as { jetton_transfers?: JettonTransfer[] };
  const out: { txId: string; amountMicro: bigint; memo: string | null; timestamp: number; from: string | null }[] =
    [];
  for (const row of body.jetton_transfers ?? []) {
    // The API filter is not trusted on its own: re-check master, recipient and tx success.
    if (row.transaction_aborted) continue;
    const txId = row.transaction_hash?.trim();
    const amount = row.amount?.trim();
    if (!txId || !amount || !/^\d+$/.test(amount)) continue;
    if (!row.jetton_master || tonAddressToRaw(row.jetton_master) !== masterRaw) continue;
    if (!row.destination || tonAddressToRaw(row.destination) !== receiverRaw) continue;
    const payload = row.decoded_forward_payload;
    const memo = payload?.["@type"] === "text_comment" ? payload.comment?.trim() || null : null;
    // M05-7: the jetton owner that sent the transfer (not the jetton wallet contract), in the
    // same normalized `wc:hex` form the order's stored payerAddress uses.
    const from = row.source ? tonAddressToRaw(row.source) : null;
    out.push({
      txId,
      amountMicro: BigInt(amount), // USDT jetton on TON has 6 decimals; not taken from the response
      memo,
      timestamp: Number(row.transaction_now ?? 0) * 1000,
      from,
    });
  }
  return out;
}
