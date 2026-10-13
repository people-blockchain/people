/**
 * Client-side glue for deploying a compiled contract as a normal EVM contract-creation
 * transaction on chain 97401.
 *
 * The /create/contract wizard used to sign a legacy factory tx and POST it to the compat
 * `tx` endpoint, which answers `405 use_evm_wallet` on this chain, so publishing from the
 * site was impossible. A creation tx is just an ordinary EVM transaction with `to` omitted
 * and the deploy bytecode (creation code + ABI-encoded constructor args) in `data`; the gas
 * limit comes from `eth_estimateGas` against the live chain.
 *
 * Kept free of React and of the wallet context so the tx-building and receipt parsing can be
 * unit-tested in plain Node.
 */
import { getAddress, isAddress, type Address, type Hex } from "viem";

/** A contract-creation transaction: bytecode in `data`, no `to`, value defaults to zero. */
export type ContractDeployTx = { data: Hex; value: bigint };

export function buildContractDeployTx(input: { data: string; value?: bigint }): ContractDeployTx {
  const data = (input.data.startsWith("0x") ? input.data : `0x${input.data}`) as Hex;
  return { data, value: input.value ?? BigInt(0) };
}

/** Deployed address from a creation receipt: `contractAddress`, or null when absent/invalid. */
export function contractAddressFromReceipt(
  receipt: { contractAddress?: string | null } | null | undefined,
): Address | null {
  const raw = receipt?.contractAddress;
  if (!raw || !isAddress(raw)) return null;
  return getAddress(raw);
}

export type ContractDeployErrorCode =
  | "wallet_rejected"
  | "insufficient_funds"
  | "reverted"
  | "unknown";

/** viem surfaces a concise `shortMessage`; fall back to the raw message otherwise. */
function messageOf(err: unknown): string {
  if (err && typeof err === "object" && "shortMessage" in err) {
    const short = (err as { shortMessage?: unknown }).shortMessage;
    if (typeof short === "string" && short.trim()) return short;
  }
  if (err && typeof err === "object" && "details" in err) {
    const details = (err as { details?: unknown }).details;
    if (typeof details === "string" && details.trim()) return details;
  }
  return err instanceof Error ? err.message : String(err ?? "error");
}

/** Turn a viem/driver error into a code the UI can explain, keeping the raw text as detail. */
export function classifyContractDeployError(err: unknown): {
  code: ContractDeployErrorCode;
  detail: string;
} {
  const detail = messageOf(err);
  const lower = detail.toLowerCase();
  let code: ContractDeployErrorCode = "unknown";
  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("4001")) {
    code = "wallet_rejected";
  } else if (lower.includes("insufficient funds") || lower.includes("exceeds balance")) {
    code = "insufficient_funds";
  } else if (
    lower.includes("reverted") ||
    lower.includes("receipt") ||
    lower.includes("execution failed")
  ) {
    code = "reverted";
  }
  return { code, detail };
}
