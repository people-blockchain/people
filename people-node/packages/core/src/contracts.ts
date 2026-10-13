import type { ContractAccount, ContractReceipt, Transaction } from "@ovn/protocol";
import { NATIVE_ASSET_ID } from "./native-asset.js";
import {
  CREATE_GAS,
  INTRINSIC_TX_GAS,
  MAX_TX_GAS_LIMIT,
  contractBlockGasLimit,
  contractGasPricePpl,
  quoteContractFeePpl
} from "./contract-fees.js";
import { getExecutionEnv } from "./execution-env.js";
import {
  bytesToHex,
  executeCall,
  executeCreate,
  hexToBytes,
  normalizeAddress,
  pplToWei
} from "./evm.js";

interface ContractHostState {
  accounts: Record<string, { balance: number; balances: Record<string, number>; nonce: number }>;
  contracts?: Record<string, ContractAccount>;
  contractReceipts?: Record<string, ContractReceipt>;
  contractMeta?: Record<string, { deployTxId: string; source?: Record<string, unknown> }>;
}

function ensureAccount(
  state: ContractHostState,
  address: string
): ContractHostState["accounts"][string] {
  if (!state.accounts[address]) {
    state.accounts[address] = { balance: 0, balances: { [NATIVE_ASSET_ID]: 0 }, nonce: 0 };
  } else {
    state.accounts[address]!.balances ??= { [NATIVE_ASSET_ID]: state.accounts[address]!.balance ?? 0 };
  }
  return state.accounts[address]!;
}

function calldataGas(data: Uint8Array): number {
  let gas = 0;
  for (const b of data) {
    gas += b === 0 ? 4 : 16;
  }
  return gas;
}

function parseHexPayload(value: unknown, label: string): Uint8Array {
  if (value === undefined || value === null || value === "") {
    return new Uint8Array();
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid ${label}`);
  }
  const hex = value.startsWith("0x") || value.startsWith("0X") ? value : `0x${value}`;
  if (hex.length > 2 * 1024 * 1024) {
    throw new Error(`${label} too large`);
  }
  return hexToBytes(hex);
}

function readGasLimit(tx: Transaction): number {
  const raw = tx.payload?.gasLimit;
  const gasLimit = Number(raw ?? 0);
  if (!Number.isSafeInteger(gasLimit) || gasLimit <= 0) {
    throw new Error("Invalid gasLimit");
  }
  if (gasLimit > MAX_TX_GAS_LIMIT) {
    throw new Error("gasLimit exceeds maximum");
  }
  return gasLimit;
}

export async function applyContractTransaction(
  state: ContractHostState,
  tx: Transaction
): Promise<ContractReceipt> {
  if (tx.type !== "contractDeploy" && tx.type !== "contractCall") {
    throw new Error("Not a contract transaction");
  }
  const from = ensureAccount(state, tx.from);
  if (from.nonce !== tx.nonce) {
    throw new Error("Invalid nonce");
  }
  if (!Number.isFinite(tx.fee) || tx.fee < 0) {
    throw new Error("Invalid transaction fee");
  }
  if (tx.amount < 0 || !Number.isFinite(tx.amount)) {
    throw new Error("Invalid value");
  }
  const gasLimit = readGasLimit(tx);
  const env = getExecutionEnv();
  if (env && env.remainingBlockGas < gasLimit) {
    throw new Error("block gas limit");
  }
  const bytecodeOrData =
    tx.type === "contractDeploy"
      ? parseHexPayload(
          `${String(tx.payload?.bytecode ?? "")}${String(tx.payload?.constructorArgs ?? "").replace(/^0x/i, "")}`,
          "bytecode"
        )
      : parseHexPayload(tx.payload?.data, "data");
  const intrinsic =
    INTRINSIC_TX_GAS +
    calldataGas(bytecodeOrData) +
    (tx.type === "contractDeploy" ? CREATE_GAS : 0);
  if (gasLimit < intrinsic) {
    throw new Error("gasLimit below intrinsic gas");
  }
  const minFee = quoteContractFeePpl(gasLimit);
  if (tx.fee + 1e-12 < minFee) {
    throw new Error("Insufficient PPL for prepaid gas");
  }
  if (from.balance < tx.amount + tx.fee) {
    throw new Error("Insufficient balance");
  }

  from.balance -= tx.fee;
  from.balances[NATIVE_ASSET_ID] = from.balance;
  from.nonce += 1;

  const snapshot = structuredClone({
    accounts: state.accounts,
    contracts: state.contracts ?? {}
  });

  const execGas = BigInt(gasLimit - intrinsic);
  let result;
  try {
    if (tx.type === "contractDeploy") {
      result = await executeCreate(state, tx.from, bytecodeOrData, pplToWei(tx.amount), execGas);
    } else {
      const to = normalizeAddress(tx.to);
      if (!state.contracts?.[to]?.code || state.contracts[to]!.code === "0x") {
        throw new Error("Not a contract");
      }
      result = await executeCall(state, tx.from, to, bytecodeOrData, pplToWei(tx.amount), execGas, false);
    }
  } catch (error) {
    state.accounts = snapshot.accounts;
    state.contracts = snapshot.contracts;
    const fromAgain = ensureAccount(state, tx.from);
    fromAgain.nonce = tx.nonce + 1;
    const gasUsed = intrinsic;
    if (env) {
      env.remainingBlockGas -= gasUsed;
    }
    const failed: ContractReceipt = {
      txId: tx.id,
      gasUsed,
      status: 0,
      logs: [],
      returnData: "0x",
      error: error instanceof Error ? error.message : "execution error"
    };
    // M12-2: persist the failed receipt so the sender can see why the fee was charged.
    state.contractReceipts ??= {};
    state.contractReceipts[tx.id] = failed;
    return failed;
  }

  const gasUsed = Math.min(gasLimit, intrinsic + result.gasUsed);
  if (env) {
    env.remainingBlockGas -= gasUsed;
  }

  if (result.reverted) {
    state.accounts = snapshot.accounts;
    state.contracts = snapshot.contracts;
    const fromAgain = ensureAccount(state, tx.from);
    fromAgain.nonce = tx.nonce + 1;
  }

  state.contractReceipts ??= {};
  const receipt: ContractReceipt = {
    txId: tx.id,
    contractAddress: result.created,
    gasUsed,
    status: result.reverted ? 0 : 1,
    logs: result.reverted ? [] : result.logs,
    returnData: bytesToHex(result.returnData),
    error: result.error
  };
  state.contractReceipts[tx.id] = receipt;
  if (receipt.contractAddress && receipt.status === 1) {
    state.contractMeta ??= {};
    const source = tx.payload?.source;
    state.contractMeta[receipt.contractAddress] = {
      deployTxId: tx.id,
      ...(source && typeof source === "object" ? { source: source as Record<string, unknown> } : {})
    };
  }
  return receipt;
}

export async function staticContractCall(
  state: ContractHostState,
  from: string,
  to: string,
  data: string,
  gasLimit = MAX_TX_GAS_LIMIT
): Promise<ContractReceipt> {
  const cloned = structuredClone({ accounts: state.accounts, contracts: state.contracts ?? {} });
  const result = await executeCall(
    { accounts: cloned.accounts, contracts: cloned.contracts },
    from || "0x" + "00".repeat(20),
    to,
    parseHexPayload(data, "data"),
    0n,
    BigInt(Math.min(gasLimit, MAX_TX_GAS_LIMIT)),
    true
  );
  return {
    txId: "eth_call",
    contractAddress: normalizeAddress(to),
    gasUsed: result.gasUsed,
    status: result.reverted ? 0 : 1,
    logs: result.logs,
    returnData: bytesToHex(result.returnData),
    error: result.error
  };
}

export function listContracts(state: ContractHostState) {
  return Object.entries(state.contracts ?? {}).map(([address, account]) => ({
    address,
    creator: account.creator,
    codeSize: hexToBytes(account.code || "0x").length,
    nonce: account.nonce
  }));
}

/** Read-side cap for author-supplied deploy source (it is stored verbatim in state). */
export const MAX_SUBMITTED_SOURCE_BYTES = 64 * 1024;

/**
 * The deploy payload's `source` is whatever the deployer sent: nothing checks it against the
 * deployed bytecode. Expose it as `submittedSource` (not "verified") and truncate oversized
 * blobs so one deploy cannot blow up every `/contracts/:address` response.
 */
function submittedSourceFor(
  source: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!source) {
    return null;
  }
  const json = JSON.stringify(source);
  if (json.length <= MAX_SUBMITTED_SOURCE_BYTES) {
    return source;
  }
  return {
    truncated: true,
    bytes: json.length,
    preview: json.slice(0, MAX_SUBMITTED_SOURCE_BYTES)
  };
}

export function getContract(state: ContractHostState, address: string) {
  const addr = normalizeAddress(address);
  const account = state.contracts?.[addr];
  if (!account) {
    return null;
  }
  return {
    address: addr,
    code: account.code,
    storage: account.storage,
    nonce: account.nonce,
    creator: account.creator,
    submittedSource: submittedSourceFor(state.contractMeta?.[addr]?.source),
    deployTxId: state.contractMeta?.[addr]?.deployTxId ?? null,
    receipts: Object.values(state.contractReceipts ?? {}).filter(
      (item) => item.contractAddress === addr || item.logs.some((log) => log.address === addr)
    )
  };
}

export { contractGasPricePpl, quoteContractFeePpl, contractBlockGasLimit };
