import { readEvmDeployments } from "@/lib/evm/config";

/**
 * AUD-M10: mirrors `LavkaPass.MAX_VISITS_PER_PURCHASE`. `createProgram` reverts with
 * `TooManyVisits` above this and with `ZeroPrice` at `priceWei == 0`, so the merchant form and
 * the on-chain verification both reject those terms instead of indexing them.
 */
export const LAVKA_MAX_VISITS_PER_PURCHASE = 100;

export function lavkaPassAddress(): `0x${string}` | null {
  const raw = readEvmDeployments().contracts.lavkaPass;
  if (!raw || raw === "null") return null;
  return raw as `0x${string}`;
}

export function merchantEscrowAddress(): `0x${string}` | null {
  const raw = readEvmDeployments().contracts.merchantEscrow;
  if (!raw || raw === "null") return null;
  return raw as `0x${string}`;
}

export function lavkaPaymentsAddress(): `0x${string}` | null {
  const raw = readEvmDeployments().contracts.lavkaPayments;
  if (!raw || raw === "null") return null;
  return raw as `0x${string}`;
}

export function lavkaContractsReady(): boolean {
  return Boolean(lavkaPassAddress() && merchantEscrowAddress() && lavkaPaymentsAddress());
}

export const lavkaPassAbi = [
  {
    type: "function",
    name: "createProgram",
    stateMutability: "nonpayable",
    inputs: [
      { name: "visitsPerPurchase", type: "uint16" },
      { name: "validUntil", type: "uint64" },
      { name: "transferable", type: "bool" },
      { name: "priceWei", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "purchasePass",
    stateMutability: "payable",
    inputs: [{ name: "programId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "redeemVisit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "programId", type: "uint256" },
      { name: "visits", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRefund",
    stateMutability: "nonpayable",
    inputs: [{ name: "programId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "programs",
    stateMutability: "view",
    inputs: [{ name: "programId", type: "uint256" }],
    outputs: [
      { name: "merchant", type: "address" },
      { name: "visitsPerPurchase", type: "uint16" },
      { name: "validUntil", type: "uint64" },
      { name: "transferable", type: "bool" },
      { name: "priceWei", type: "uint256" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "nextProgramId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const merchantEscrowAbi = [
  {
    type: "function",
    name: "createEscrow",
    stateMutability: "payable",
    inputs: [
      { name: "merchant", type: "address" },
      { name: "deadline", type: "uint64" },
      { name: "termsHash", type: "bytes32" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "releaseToMerchant",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refundCustomer",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "openDispute",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "escrows",
    stateMutability: "view",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [
      { name: "merchant", type: "address" },
      { name: "customer", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "status", type: "uint8" },
      { name: "termsHash", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "nextEscrowId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const lavkaPaymentsAbi = [
  {
    type: "function",
    name: "payMerchant",
    stateMutability: "payable",
    inputs: [
      { name: "merchant", type: "address" },
      { name: "memoHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;
