/**
 * Cosmos transaction lookup for the explorer.
 *
 * Cosmos SDK tx hashes are 64 hex characters with no `0x` prefix, so the EVM compat
 * lookup can never resolve them (it rejects anything that is not `0x` + 64 hex). The
 * public node's REST gateway exposes `GET /cosmos/tx/v1beta1/txs/{hash}`, which this
 * module fetches and flattens into a small, renderable summary — enough for the
 * governance "View transaction" link to resolve to a readable page.
 *
 * Kept free of React and of the wallet so the hash check and the summariser can be
 * unit-tested in plain Node.
 */
import { GOV_REST_BASE } from "@/lib/gov/rest";

/** A Cosmos hash: 64 hex chars, no `0x`. EVM hashes carry the prefix and are handled elsewhere. */
export function isCosmosTxHash(id: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(id.trim());
}

export type CosmosTxMessage = { type: string; summary: string };

export type CosmosTxSummary = {
  hash: string;
  height?: number;
  time?: string;
  code: number;
  success: boolean;
  messages: CosmosTxMessage[];
  fee?: string;
  gasWanted?: number;
  gasUsed?: number;
  memo?: string;
};

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" ? (value as AnyRecord) : null;
}

/** `/cosmos.gov.v1.MsgVote` -> `MsgVote`. */
function shortType(type: string): string {
  const parts = type.split(".");
  return parts[parts.length - 1] || type;
}

/** `VOTE_OPTION_YES` -> `Yes`. */
function optionWord(raw: unknown): string {
  const text = String(raw ?? "");
  const match = /VOTE_OPTION_(\w+)/.exec(text);
  const word = match ? match[1] : text;
  return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : "";
}

function coinsToString(amount: unknown): string | undefined {
  if (!Array.isArray(amount)) return undefined;
  const parts = amount
    .map((coin) => {
      const row = asRecord(coin);
      return row ? `${row.amount} ${row.denom}` : "";
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** One-line, language-neutral description of a message body. */
export function describeMessage(message: AnyRecord): CosmosTxMessage {
  const type = shortType(String(message["@type"] ?? "Unknown"));
  const proposal = String(message.proposal_id ?? message.proposalId ?? "—");
  const voter = typeof message.voter === "string" ? message.voter : "";
  switch (type) {
    case "MsgVote":
      return { type, summary: `Vote ${optionWord(message.option)} on proposal #${proposal}${voter ? ` · ${voter}` : ""}` };
    case "MsgVoteWeighted": {
      const options = Array.isArray(message.options) ? message.options : [];
      const parts = options
        .map((option) => {
          const row = asRecord(option);
          return row ? `${optionWord(row.option)} ${row.weight}` : "";
        })
        .filter(Boolean);
      return {
        type,
        summary: `Weighted vote on proposal #${proposal}${parts.length ? ` (${parts.join(", ")})` : ""}`,
      };
    }
    case "MsgSend": {
      const coins = coinsToString(message.amount) ?? "—";
      return { type, summary: `Send ${coins} to ${String(message.to_address ?? "—")}` };
    }
    default:
      return { type, summary: type };
  }
}

/** Flatten the REST `tx` + `tx_response` payload into a renderable summary, or null when malformed. */
export function summarizeCosmosTx(payload: unknown): CosmosTxSummary | null {
  const response = asRecord(asRecord(payload)?.tx_response);
  if (!response) return null;
  const tx = asRecord(response.tx);
  const txBody = asRecord(tx?.body);
  const fee = asRecord(asRecord(tx?.auth_info)?.fee);

  const rawMessages = Array.isArray(txBody?.messages) ? txBody.messages : [];
  const messages = rawMessages.map((message) => describeMessage(asRecord(message) ?? {}));

  const code = Number(response.code ?? 0);
  const gasWanted = response.gas_wanted ?? fee?.gas_limit;

  return {
    hash: String(response.txhash ?? ""),
    height: response.height != null ? Number(response.height) : undefined,
    time: typeof response.timestamp === "string" ? response.timestamp : undefined,
    code,
    success: code === 0,
    messages,
    fee: coinsToString(fee?.amount),
    gasWanted: gasWanted != null ? Number(gasWanted) : undefined,
    gasUsed: response.gas_used != null ? Number(response.gas_used) : undefined,
    memo: typeof txBody?.memo === "string" && txBody.memo ? txBody.memo : undefined,
  };
}

/** Fetch a Cosmos tx by hash; null when the node does not know it (404). */
export async function fetchCosmosTx(hash: string): Promise<CosmosTxSummary | null> {
  const res = await fetch(`${GOV_REST_BASE}/cosmos/tx/v1beta1/txs/${encodeURIComponent(hash.trim())}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`cosmos_tx_${res.status}`);
  return summarizeCosmosTx(await res.json().catch(() => null));
}
