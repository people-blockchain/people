import { saleReceiverFromEnv } from "@/lib/sale/networks";

const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOLANA_MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const STABLE_MINTS = [
  { stable: "usdt", mint: USDT_MINT },
  { stable: "usdc", mint: USDC_MINT },
] as const;

export type SolanaSaleTransfer = {
  txId: string;
  stable: "usdt" | "usdc";
  amountMicro: bigint;
  memo: string | null;
  timestamp: number;
  from: string | null;
};

type TokenBalance = { mint?: string; owner?: string; uiTokenAmount?: { amount?: string } };

type ParsedInstruction = { programId?: string; parsed?: unknown };

type SolanaTx = {
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
  transaction?: { message?: { instructions?: ParsedInstruction[] } };
};

async function rpcCall<T>(rpc: string, method: string, params: unknown[]): Promise<T | null> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { result?: T };
  return body.result ?? null;
}

function ownedAmount(balances: TokenBalance[] | undefined, owner: string, mint: string): bigint {
  let total = BigInt(0);
  for (const b of balances ?? []) {
    if (b.owner !== owner || b.mint !== mint) continue;
    const raw = b.uiTokenAmount?.amount;
    if (raw && /^\d+$/.test(raw)) total += BigInt(raw);
  }
  return total;
}

/**
 * M05-7: the owner of the token account whose balance for `mint` decreased (the sender), so
 * the order's stored payerAddress can be checked against it. The receiver's own account is
 * skipped — only an owner other than the receiver can be the sender of an incoming transfer.
 */
function senderOwnerForMint(
  pre: TokenBalance[] | undefined,
  post: TokenBalance[] | undefined,
  mint: string,
  receiver: string,
): string | null {
  const owners = new Set<string>();
  for (const b of [...(pre ?? []), ...(post ?? [])]) {
    if (b.mint === mint && b.owner) owners.add(b.owner);
  }
  for (const owner of owners) {
    if (owner === receiver) continue;
    const delta = ownedAmount(post, owner, mint) - ownedAmount(pre, owner, mint);
    if (delta < BigInt(0)) return owner;
  }
  return null;
}

function memoFromInstructions(instructions: ParsedInstruction[] | undefined): string | null {
  for (const ix of instructions ?? []) {
    if (ix.programId === SOLANA_MEMO_PROGRAM_ID && typeof ix.parsed === "string") {
      return ix.parsed.trim() || null;
    }
  }
  return null;
}

/**
 * Finalized, successful transactions that increased the sale receiver's USDT/USDC balance.
 * The amount is the receiver's post − pre token balance (covers inner instructions; a
 * self-transfer or a reverted transaction yields nothing).
 */
export async function fetchSolanaSplTransfers(limit = 25): Promise<SolanaSaleTransfer[]> {
  const receiver = saleReceiverFromEnv("solana");
  if (!receiver) return [];
  const rpc = process.env.SALE_SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";

  // Incoming SPL transfers touch the receiver's token accounts, not necessarily the owner.
  const tokenAccounts = new Set<string>();
  for (const { mint } of STABLE_MINTS) {
    const accounts = await rpcCall<{ value?: { pubkey?: string }[] }>(rpc, "getTokenAccountsByOwner", [
      receiver,
      { mint },
      { encoding: "jsonParsed", commitment: "finalized" },
    ]);
    for (const a of accounts?.value ?? []) {
      if (a.pubkey) tokenAccounts.add(a.pubkey);
    }
  }

  const signatures = new Set<string>();
  for (const account of tokenAccounts) {
    const sigs = await rpcCall<{ signature?: string; err?: unknown }[]>(rpc, "getSignaturesForAddress", [
      account,
      { limit, commitment: "finalized" },
    ]);
    for (const s of sigs ?? []) {
      if (s.signature && (s.err === null || s.err === undefined)) signatures.add(s.signature);
    }
  }

  const out: SolanaSaleTransfer[] = [];
  for (const txId of signatures) {
    const tx = await rpcCall<SolanaTx>(rpc, "getTransaction", [
      txId,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "finalized" },
    ]);
    const meta = tx?.meta;
    if (!meta || meta.err !== null) continue;
    const memo = memoFromInstructions(tx.transaction?.message?.instructions);
    for (const { stable, mint } of STABLE_MINTS) {
      const delta =
        ownedAmount(meta.postTokenBalances, receiver, mint) - ownedAmount(meta.preTokenBalances, receiver, mint);
      if (delta <= BigInt(0)) continue;
      const from = senderOwnerForMint(meta.preTokenBalances, meta.postTokenBalances, mint, receiver);
      out.push({ txId, stable, amountMicro: delta, memo, timestamp: Number(tx.blockTime ?? 0) * 1000, from });
    }
  }
  return out;
}
