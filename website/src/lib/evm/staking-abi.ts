import type { Address } from "viem";

/** Cosmos EVM static precompiles — same address on every cosmos-evm chain, incl. ours. */
export const STAKING_PRECOMPILE_ADDRESS: Address = "0x0000000000000000000000000000000000000800";
export const DISTRIBUTION_PRECOMPILE_ADDRESS: Address = "0x0000000000000000000000000000000000000801";

const pageRequestType = {
  name: "pageRequest",
  type: "tuple",
  components: [
    { name: "key", type: "bytes" },
    { name: "offset", type: "uint64" },
    { name: "limit", type: "uint64" },
    { name: "countTotal", type: "bool" },
    { name: "reverse", type: "bool" },
  ],
} as const;

const pageResponseType = {
  name: "pageResponse",
  type: "tuple",
  components: [
    { name: "nextKey", type: "bytes" },
    { name: "total", type: "uint64" },
  ],
} as const;

const validatorType = {
  type: "tuple",
  components: [
    { name: "operatorAddress", type: "string" },
    { name: "consensusPubkey", type: "string" },
    { name: "jailed", type: "bool" },
    { name: "status", type: "uint8" },
    { name: "tokens", type: "uint256" },
    { name: "delegatorShares", type: "uint256" },
    { name: "description", type: "string" },
    { name: "unbondingHeight", type: "int64" },
    { name: "unbondingTime", type: "int64" },
    { name: "commission", type: "uint256" },
    { name: "minSelfDelegation", type: "uint256" },
  ],
} as const;

const coinType = {
  type: "tuple",
  components: [
    { name: "denom", type: "string" },
    { name: "amount", type: "uint256" },
  ],
} as const;

const decCoinType = {
  type: "tuple",
  components: [
    { name: "denom", type: "string" },
    { name: "amount", type: "uint256" },
    { name: "precision", type: "uint8" },
  ],
} as const;

const unbondingDelegationEntryType = {
  type: "tuple",
  components: [
    { name: "creationHeight", type: "int64" },
    { name: "completionTime", type: "int64" },
    { name: "initialBalance", type: "uint256" },
    { name: "balance", type: "uint256" },
    { name: "unbondingId", type: "uint64" },
    { name: "unbondingOnHoldRefCount", type: "int64" },
  ],
} as const;

/** `BondStatus` enum order from StakingI.sol — the precompile returns it as uint8. */
export const BOND_STATUS = ["Unspecified", "Unbonded", "Unbonding", "Bonded"] as const;
export type BondStatus = (typeof BOND_STATUS)[number];

export const stakingAbi = [
  {
    type: "function",
    name: "validators",
    stateMutability: "view",
    inputs: [
      { name: "status", type: "string" },
      pageRequestType,
    ],
    outputs: [
      { name: "validators", type: "tuple[]", components: validatorType.components },
      pageResponseType,
    ],
  },
  {
    type: "function",
    name: "delegation",
    stateMutability: "view",
    inputs: [
      { name: "delegatorAddress", type: "address" },
      { name: "validatorAddress", type: "string" },
    ],
    outputs: [
      { name: "shares", type: "uint256" },
      { name: "balance", type: "tuple", components: coinType.components },
    ],
  },
  {
    type: "function",
    name: "unbondingDelegation",
    stateMutability: "view",
    inputs: [
      { name: "delegatorAddress", type: "address" },
      { name: "validatorAddress", type: "string" },
    ],
    outputs: [
      {
        name: "unbondingDelegation",
        type: "tuple",
        components: [
          { name: "delegatorAddress", type: "string" },
          { name: "validatorAddress", type: "string" },
          { name: "entries", type: "tuple[]", components: unbondingDelegationEntryType.components },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "delegate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "delegatorAddress", type: "address" },
      { name: "validatorAddress", type: "string" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    type: "function",
    name: "undelegate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "delegatorAddress", type: "address" },
      { name: "validatorAddress", type: "string" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "completionTime", type: "int64" }],
  },
  {
    type: "function",
    name: "redelegate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "delegatorAddress", type: "address" },
      { name: "validatorSrcAddress", type: "string" },
      { name: "validatorDstAddress", type: "string" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "completionTime", type: "int64" }],
  },
] as const;

export const distributionAbi = [
  {
    type: "function",
    name: "delegationTotalRewards",
    stateMutability: "view",
    inputs: [{ name: "delegatorAddress", type: "address" }],
    outputs: [
      {
        name: "rewards",
        type: "tuple[]",
        components: [
          { name: "validatorAddress", type: "string" },
          { name: "reward", type: "tuple[]", components: decCoinType.components },
        ],
      },
      { name: "total", type: "tuple[]", components: decCoinType.components },
    ],
  },
  {
    type: "function",
    name: "claimRewards",
    stateMutability: "nonpayable",
    inputs: [
      { name: "delegatorAddress", type: "address" },
      { name: "maxRetrieve", type: "uint32" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

export type PrecompileValidator = {
  operatorAddress: string;
  consensusPubkey: string;
  jailed: boolean;
  status: number;
  tokens: bigint;
  delegatorShares: bigint;
  description: string;
  unbondingHeight: bigint;
  unbondingTime: bigint;
  commission: bigint;
  minSelfDelegation: bigint;
};

export type PrecompileCoin = { denom: string; amount: bigint };
export type PrecompileDecCoin = { denom: string; amount: bigint; precision: number };
