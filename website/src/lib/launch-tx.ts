/**
 * Resume state for the token launch: the transaction hash is stored as soon as the wallet returns
 * it, so a closed tab can restore the outcome from the receipt instead of waiting forever.
 *
 * `outcomeOfReceipt` and `planTokenRestore` are pure; the store falls back to memory when
 * `localStorage` is unavailable (private mode), the same way `nft-mint-draft.ts` does.
 */

export type TxOutcome = "success" | "failed" | "pending";

type ReceiptLike = { status?: string } | null | undefined;

/** `pending` covers "no receipt yet" and "the node could not answer": neither proves a failure. */
export function outcomeOfReceipt(receipt: ReceiptLike): TxOutcome {
  if (!receipt) return "pending";
  const status = receipt.status;
  if (status === "success" || status === "0x1" || status === "0x01") return "success";
  return "failed";
}

export type TokenLaunchStage = "pay" | "create";

export type TokenLaunchTx = {
  version: 1;
  /** Lower-case wallet address the record belongs to. */
  owner: string;
  stage: TokenLaunchStage;
  hash: `0x${string}`;
  name: string;
  symbol: string;
  supply: string;
};

/** What the form shows after reading the receipt of the stored transaction. */
export type TokenRestore = "created" | "payment_counted" | "failed" | "pending";

export function planTokenRestore(stage: TokenLaunchStage, outcome: TxOutcome): TokenRestore {
  if (outcome === "pending") return "pending";
  if (outcome === "failed") return "failed";
  return stage === "create" ? "created" : "payment_counted";
}

export const TOKEN_LAUNCH_TX_KEY = "people_token_launch_tx_v1";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function isRecord(value: unknown): value is TokenLaunchTx {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<TokenLaunchTx>;
  return (
    record.version === 1 &&
    typeof record.owner === "string" &&
    (record.stage === "pay" || record.stage === "create") &&
    typeof record.hash === "string" &&
    HASH_RE.test(record.hash) &&
    typeof record.name === "string" &&
    typeof record.symbol === "string" &&
    typeof record.supply === "string"
  );
}

export function createTokenLaunchTxStore(getStorage: () => StorageLike | null) {
  const memory = new Map<string, string>();
  const keyFor = (owner: string) => `${TOKEN_LAUNCH_TX_KEY}:${owner.toLowerCase()}`;
  return {
    load(owner: string): TokenLaunchTx | null {
      const key = keyFor(owner);
      let raw: string | null = memory.get(key) ?? null;
      try {
        raw = getStorage()?.getItem(key) ?? raw;
      } catch {
        /* memory copy */
      }
      if (!raw) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return isRecord(parsed) && parsed.owner === owner.toLowerCase() ? parsed : null;
      } catch {
        return null;
      }
    },
    save(record: TokenLaunchTx): void {
      const key = keyFor(record.owner);
      const raw = JSON.stringify(record);
      memory.set(key, raw);
      try {
        getStorage()?.setItem(key, raw);
      } catch {
        /* memory copy only */
      }
    },
    clear(owner: string): void {
      const key = keyFor(owner);
      memory.delete(key);
      try {
        getStorage()?.removeItem(key);
      } catch {
        /* nothing to clear */
      }
    },
  };
}
