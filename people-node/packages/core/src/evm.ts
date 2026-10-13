/**
 * Deterministic EVM execution via @ethereumjs/evm (Shanghai).
 * Contract code and storage are committed back into ChainState for stateRoot.
 */
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { createCustomCommon, Hardfork, Mainnet } from "@ethereumjs/common";
import { createEVM, EVMMockBlockchain, type Log as EvmLog } from "@ethereumjs/evm";
import { SimpleStateManager } from "@ethereumjs/statemanager";
import {
  Account,
  createAddressFromString,
  setLengthLeft,
  type Address
} from "@ethereumjs/util";
import { contractBlockGasLimit } from "./contract-fees.js";
import { getExecutionEnv } from "./execution-env.js";
import { NATIVE_ASSET_ID } from "./native-asset.js";
import { EIP155_CHAIN_ID } from "@ovn/protocol";
import type { ContractAccount, ContractLog } from "@ovn/protocol";

export const PEOPLE_EVM_HARDFORK = Hardfork.Shanghai;

export interface EvmHostState {
  accounts: Record<string, { balance: number; balances: Record<string, number>; nonce: number }>;
  contracts?: Record<string, ContractAccount>;
}

function ensureAccount(state: EvmHostState, address: string): EvmHostState["accounts"][string] {
  if (!state.accounts[address]) {
    state.accounts[address] = {
      balance: 0,
      balances: { [NATIVE_ASSET_ID]: 0 },
      nonce: 0
    };
  } else {
    const acct = state.accounts[address]!;
    acct.balances ??= { [NATIVE_ASSET_ID]: acct.balance ?? 0 };
  }
  return state.accounts[address]!;
}

const MICRO = 1_000_000n;
const ZERO_WORD = "0x" + "00".repeat(32);

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) {
    throw new Error("Invalid hex");
  }
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: ArrayLike<number>): string {
  let s = "0x";
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return s;
}

const CANONICAL_ADDRESS = /^0x[0-9a-f]{40}$/;

/** Local copy of index.ts isCanonicalAddress (avoids a cyclic import). */
function isCanonicalKey(address: string): boolean {
  return CANONICAL_ADDRESS.test(address);
}

export function normalizeAddress(addr: string): string {
  const h = addr.startsWith("0x") ? addr.slice(2) : addr;
  return `0x${h.toLowerCase().padStart(40, "0").slice(-40)}`;
}

export function u256ToBytes(n: bigint): Uint8Array {
  const v = ((n % (1n << 256n)) + (1n << 256n)) % (1n << 256n);
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

export function bytesToU256(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) {
    n = (n << 8n) + BigInt(b);
  }
  return n;
}

export function slotKey(n: bigint): string {
  return bytesToHex(u256ToBytes(n));
}

export function rlpEncodeBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 1 && bytes[0]! < 0x80) {
    return bytes;
  }
  if (bytes.length <= 55) {
    const out = new Uint8Array(1 + bytes.length);
    out[0] = 0x80 + bytes.length;
    out.set(bytes, 1);
    return out;
  }
  const len = encodeLength(bytes.length);
  const out = new Uint8Array(1 + len.length + bytes.length);
  out[0] = 0xb7 + len.length;
  out.set(len, 1);
  out.set(bytes, 1 + len.length);
  return out;
}

function encodeLength(n: number): Uint8Array {
  if (n === 0) {
    return new Uint8Array([0]);
  }
  const parts: number[] = [];
  let x = n;
  while (x > 0) {
    parts.push(x & 0xff);
    x >>= 8;
  }
  return Uint8Array.from(parts.reverse());
}

export function rlpEncodeList(items: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const item of items) {
    total += item.length;
  }
  if (total <= 55) {
    const out = new Uint8Array(1 + total);
    out[0] = 0xc0 + total;
    let o = 1;
    for (const item of items) {
      out.set(item, o);
      o += item.length;
    }
    return out;
  }
  const len = encodeLength(total);
  const out = new Uint8Array(1 + len.length + total);
  out[0] = 0xf7 + len.length;
  out.set(len, 1);
  let o = 1 + len.length;
  for (const item of items) {
    out.set(item, o);
    o += item.length;
  }
  return out;
}

export function rlpEncodeUint(n: bigint): Uint8Array {
  if (n === 0n) {
    return new Uint8Array([0x80]);
  }
  const bytes = u256ToBytes(n);
  let i = 0;
  while (i < bytes.length && bytes[i] === 0) {
    i++;
  }
  return rlpEncodeBytes(bytes.slice(i));
}

export function createAddress(sender: string, nonce: number): string {
  const addr = hexToBytes(normalizeAddress(sender));
  const encoded = rlpEncodeList([rlpEncodeBytes(addr), rlpEncodeUint(BigInt(nonce))]);
  return normalizeAddress(bytesToHex(keccak_256(encoded).slice(12)));
}

/** Convert PPL (up to 6 decimal places) to micro-PPL wei without float rounding. */
export function pplToWei(ppl: number): bigint {
  if (!Number.isFinite(ppl) || ppl <= 0) {
    return 0n;
  }
  const whole = BigInt(Math.trunc(ppl));
  const fracMicro = BigInt(Math.round((ppl - Math.trunc(ppl)) * 1e6));
  return whole * MICRO + fracMicro;
}

export function weiToPpl(wei: bigint): number {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / MICRO;
  const frac = abs % MICRO;
  const value = Number(whole) + Number(frac) / 1e6;
  return negative ? -value : value;
}

export function canonicalizeAccounts(
  accounts: Record<string, { balance: number; balances: Record<string, number>; nonce: number }>
): Record<string, { balance: number; balances: Record<string, number>; nonce: number }> {
  const out: Record<string, { balance: number; balances: Record<string, number>; nonce: number }> = {};
  for (const address of Object.keys(accounts).sort()) {
    const acct = accounts[address]!;
    const balances: Record<string, number> = {};
    for (const assetId of Object.keys(acct.balances ?? {}).sort()) {
      balances[assetId] = acct.balances![assetId]!;
    }
    out[address.toLowerCase()] = {
      balance: acct.balance,
      balances,
      nonce: acct.nonce
    };
  }
  return out;
}

export function canonicalizeContracts(contracts: Record<string, ContractAccount>): Record<string, ContractAccount> {
  const out: Record<string, ContractAccount> = {};
  for (const address of Object.keys(contracts).sort()) {
    const c = contracts[address]!;
    const storage: Record<string, string> = {};
    for (const key of Object.keys(c.storage).sort()) {
      const value = c.storage[key]!;
      if (value !== ZERO_WORD && value !== "0x0") {
        storage[key.toLowerCase()] = value.toLowerCase();
      }
    }
    out[address.toLowerCase()] = {
      code: c.code.toLowerCase(),
      storage,
      nonce: c.nonce,
      creator: c.creator.toLowerCase()
    };
  }
  return out;
}

export function ensureContracts(state: EvmHostState): Record<string, ContractAccount> {
  state.contracts ??= {};
  return state.contracts;
}

export interface EvmResult {
  returnData: Uint8Array;
  gasUsed: number;
  logs: ContractLog[];
  reverted: boolean;
  created?: string;
  error?: string;
}

function chainIdNumber(_chainId: string): number {
  return EIP155_CHAIN_ID;
}

function toAddress(addr: string): Address {
  return createAddressFromString(normalizeAddress(addr));
}

function isHexAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** People proposers may be non-hex ids (e.g. bootstrap-validator). */
function coinbaseAddress(proposer: string | undefined): Address {
  if (!proposer) {
    return toAddress("0x" + "00".repeat(20));
  }
  if (isHexAddress(proposer)) {
    return toAddress(proposer);
  }
  const digest = keccak_256(new TextEncoder().encode(proposer));
  return createAddressFromString(bytesToHex(digest.slice(12)));
}

/** Header timestamps are Date.now() milliseconds; Solidity expects Unix seconds. */
function evmTimestamp(raw: number | undefined): bigint {
  if (!Number.isFinite(raw) || !raw || raw <= 0) {
    return 0n;
  }
  const n = Math.floor(raw);
  return BigInt(n > 1_000_000_000_000 ? Math.floor(n / 1000) : n);
}

function isPrecompile(addr: string): boolean {
  const n = Number.parseInt(normalizeAddress(addr).slice(2), 16);
  return n >= 1 && n <= 9;
}

function storageSlotHex(key: Uint8Array): string {
  return bytesToHex(setLengthLeft(key, 32));
}

function storageValueHex(value: Uint8Array): string {
  if (value.length === 0) {
    return ZERO_WORD;
  }
  return bytesToHex(setLengthLeft(value, 32));
}

function mapLogs(logs: EvmLog[] | undefined): ContractLog[] {
  if (!logs) {
    return [];
  }
  return logs.map((log) => ({
    address: normalizeAddress(bytesToHex(log[0])),
    topics: log[1].map((topic) => bytesToHex(topic)),
    data: bytesToHex(log[2])
  }));
}

type EvmBlock = {
  header: {
    number: bigint;
    coinbase: Address;
    timestamp: bigint;
    difficulty: bigint;
    prevRandao: Uint8Array;
    gasLimit: bigint;
    baseFeePerGas?: bigint;
    slotNumber?: bigint;
    getBlobGasPrice(): bigint | undefined;
  };
};

function executionBlock(): EvmBlock {
  const env = getExecutionEnv();
  return {
    header: {
      number: BigInt(env?.blockNumber ?? 0),
      coinbase: coinbaseAddress(env?.proposer),
      timestamp: evmTimestamp(env?.timestamp),
      difficulty: 0n,
      prevRandao: new Uint8Array(32),
      gasLimit: BigInt(contractBlockGasLimit()),
      baseFeePerGas: 0n,
      slotNumber: 0n,
      getBlobGasPrice: () => undefined
    }
  };
}

async function hydrateState(sm: SimpleStateManager, state: EvmHostState): Promise<void> {
  // M12-4: a contract address is also present in `state.accounts` (every account `commitState`
  // touches gets one), always with nonce 0 there — only `state.contracts[addr].nonce` is ever
  // incremented on a child `CREATE`. Behind the upgrade, a contract address hydrates its nonce
  // from `state.contracts`, so a factory can deploy more than one child.
  const consensusUpgrade1 = getExecutionEnv()?.consensusUpgrade1 === true;
  const seen = new Set<string>();
  for (const [raw, acct] of Object.entries(state.accounts)) {
    // Non-canonical keys are never loaded or normalized: normalizeAddress would
    // alias them onto a canonical account and overwrite its balance.
    if (!isCanonicalKey(raw)) continue;
    const addr = raw;
    seen.add(addr);
    const contractNonce = consensusUpgrade1 ? state.contracts?.[addr]?.nonce : undefined;
    await sm.putAccount(
      toAddress(addr),
      new Account(BigInt(contractNonce ?? acct.nonce), pplToWei(acct.balance ?? 0))
    );
  }
  for (const [raw, contract] of Object.entries(state.contracts ?? {})) {
    if (!isCanonicalKey(raw)) continue;
    const addr = raw;
    const protocol = state.accounts[addr];
    if (!seen.has(addr)) {
      await sm.putAccount(
        toAddress(addr),
        new Account(BigInt(contract.nonce), pplToWei(protocol?.balance ?? 0))
      );
    }
    if (contract.code && contract.code !== "0x") {
      await sm.putCode(toAddress(addr), hexToBytes(contract.code));
    }
    for (const [slot, value] of Object.entries(contract.storage)) {
      await sm.putStorage(
        toAddress(addr),
        setLengthLeft(hexToBytes(slot), 32),
        setLengthLeft(hexToBytes(value), 32)
      );
    }
  }
}

async function commitState(sm: SimpleStateManager, state: EvmHostState, creator: string): Promise<void> {
  const contracts = ensureContracts(state);
  const accounts = sm.accountStack[sm.accountStack.length - 1] ?? new Map();
  const codeMap = sm.codeStack[sm.codeStack.length - 1] ?? new Map();
  const storageMap = sm.storageStack[sm.storageStack.length - 1] ?? new Map();

  for (const [hex, account] of accounts) {
    const addr = normalizeAddress(hex);
    if (isPrecompile(addr) || account === undefined) {
      continue;
    }
    // addr is canonical by construction (normalizeAddress); state.accounts keys that
    // are not canonical are never hydrated and are never written here.
    const existed = isCanonicalKey(addr) && state.accounts[addr] !== undefined;
    const protocol = ensureAccount(state, addr);
    // Hydration rounds to micro-PPL. Write back only if the EVM changed the balance;
    // untouched accounts are left exactly as they were.
    if (!existed) {
      protocol.balance = weiToPpl(account.balance);
      protocol.balances[NATIVE_ASSET_ID] = protocol.balance;
    } else if (account.balance !== pplToWei(protocol.balance)) {
      protocol.balance = weiToPpl(account.balance);
      protocol.balances[NATIVE_ASSET_ID] = protocol.balance;
    }

    const code = codeMap.get(hex as `0x${string}`) ?? new Uint8Array();
    if (code.length > 0) {
      const storage: Record<string, string> = {};
      const prefix = `${hex}_`;
      for (const [key, value] of storageMap) {
        if (!key.startsWith(prefix) || value.length === 0) {
          continue;
        }
        const slot = storageSlotHex(hexToBytes(key.slice(prefix.length)));
        const word = storageValueHex(value);
        if (word !== ZERO_WORD) {
          storage[slot] = word;
        }
      }
      const prev = contracts[addr];
      contracts[addr] = {
        code: bytesToHex(code),
        storage,
        nonce: Number(account.nonce),
        creator: prev?.creator ?? normalizeAddress(creator)
      };
    } else if (contracts[addr]) {
      delete contracts[addr];
    }
  }
}

async function runMessage(
  state: EvmHostState,
  opts: {
    sender: string;
    to?: string;
    data: Uint8Array;
    valueWei: bigint;
    gasLimit: bigint;
    readOnly: boolean;
  }
): Promise<EvmResult> {
  const env = getExecutionEnv();
  const common = createCustomCommon(
    {
      name: "people",
      chainId: chainIdNumber(env?.chainId ?? "people")
    },
    Mainnet,
    { hardfork: PEOPLE_EVM_HARDFORK }
  );
  const sm = new SimpleStateManager({ common });
  await hydrateState(sm, state);
  const evm = await createEVM({
    common,
    stateManager: sm,
    blockchain: new EVMMockBlockchain(),
    // SELFDESTRUCT is not part of the People's contract surface (legacy interpreter disabled it).
    customOpcodes: [{ opcode: 0xff }]
  });
  const caller = toAddress(opts.sender);
  const result = await evm.runCall({
    block: executionBlock(),
    caller,
    origin: caller,
    to: opts.to ? toAddress(opts.to) : undefined,
    data: opts.data,
    gasLimit: opts.gasLimit,
    value: opts.readOnly ? 0n : opts.valueWei,
    isStatic: opts.readOnly,
    skipNonceIncrement: true,
    skipBalance: opts.readOnly
  });
  const exec = result.execResult;
  const reverted = Boolean(exec.exceptionError);
  const created = result.createdAddress ? normalizeAddress(result.createdAddress.toString()) : undefined;
  if (!reverted && !opts.readOnly) {
    await commitState(sm, state, opts.sender);
  }
  const error = exec.exceptionError
    ? String(exec.exceptionError.error ?? exec.exceptionError)
    : undefined;
  return {
    returnData: exec.returnValue ?? new Uint8Array(),
    gasUsed: Number(exec.executionGasUsed),
    logs: reverted ? [] : mapLogs(exec.logs),
    reverted,
    created,
    error
  };
}

export async function executeCreate(
  state: EvmHostState,
  sender: string,
  bytecode: Uint8Array,
  valueWei: bigint,
  gasLimit: bigint
): Promise<EvmResult> {
  return runMessage(state, {
    sender,
    data: bytecode,
    valueWei,
    gasLimit,
    readOnly: false
  });
}

export async function executeCall(
  state: EvmHostState,
  sender: string,
  to: string,
  data: Uint8Array,
  valueWei: bigint,
  gasLimit: bigint,
  readOnly = false
): Promise<EvmResult> {
  return runMessage(state, {
    sender,
    to: normalizeAddress(to),
    data,
    valueWei,
    gasLimit,
    readOnly
  });
}

/** Init code that copies trailing runtime bytes to memory and returns them. */
export function wrapRuntimeAsDeploy(runtime: Uint8Array): Uint8Array {
  const size = runtime.length;
  const pushSize = new Uint8Array([0x60, size & 0xff]);
  if (size > 255) {
    const b = u256ToBytes(BigInt(size)).slice(30);
    const header = new Uint8Array([0x61, b[0]!, b[1]!]);
    return wrapWithHeader(header, runtime);
  }
  return wrapWithHeader(pushSize, runtime);
}

function wrapWithHeader(sizePush: Uint8Array, runtime: Uint8Array): Uint8Array {
  const prefixLen = sizePush.length + 9;
  const out = new Uint8Array(prefixLen + runtime.length);
  let i = 0;
  out.set(sizePush, i);
  i += sizePush.length;
  out[i++] = 0x80;
  out[i++] = 0x60;
  out[i++] = prefixLen;
  out[i++] = 0x60;
  out[i++] = 0x00;
  out[i++] = 0x39;
  out[i++] = 0x60;
  out[i++] = 0x00;
  out[i++] = 0xf3;
  out.set(runtime, i);
  return out;
}
