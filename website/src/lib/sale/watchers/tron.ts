import { saleReceiverFromEnv } from "@/lib/sale/networks";

/** Official Tether USD (TRC20) contract on Tron mainnet; 6 decimals. */
export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

type Trc20Tx = {
  transaction_id?: string;
  block_timestamp?: number;
  value?: string;
  from?: string;
  to?: string;
  type?: string;
  token_info?: { address?: string; decimals?: number };
};

/** Confirmed incoming USDT TRC20 transfers to the sale receiver (other tokens are ignored). */
export async function fetchTronUsdtTransfers(limit = 40): Promise<
  { txId: string; to: string; amountMicro: bigint; timestamp: number; from: string | null }[]
> {
  const receiver = saleReceiverFromEnv("tron");
  if (!receiver) return [];
  const url =
    `https://api.trongrid.io/v1/accounts/${receiver}/transactions/trc20` +
    `?limit=${limit}&only_to=true&only_confirmed=true&contract_address=${USDT_TRC20_CONTRACT}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: Trc20Tx[] };
  const out: { txId: string; to: string; amountMicro: bigint; timestamp: number; from: string | null }[] = [];
  for (const row of body.data ?? []) {
    const txId = row.transaction_id?.trim();
    const to = row.to?.trim();
    const value = row.value?.trim();
    if (!txId || !to || !value) continue;
    // The API filter is not trusted on its own: re-check token, event type and recipient.
    if (row.token_info?.address !== USDT_TRC20_CONTRACT) continue;
    if (row.type !== "Transfer") continue;
    if (to !== receiver) continue;
    if (!/^\d+$/.test(value)) continue;
    out.push({
      txId,
      to,
      amountMicro: BigInt(value), // USDT TRC20 has 6 decimals; not taken from the response
      timestamp: Number(row.block_timestamp ?? 0),
      // M05-7: the sender address, so the order's stored payerAddress can be checked against it.
      from: row.from?.trim() || null,
    });
  }
  return out;
}
