/**
 * Minimal PplCurveHubV2 ABI (only the surface `/buy` uses).
 *
 * Kept apart from the V1 generated ABI: V2 binds a verified person with
 * `verify(bytes32,uint256,bytes)` and sells with
 * `buy(uint256,uint256,address,address)`.
 */
export const PPL_CURVE_HUB_V2_ABI = [
  {
    type: "function",
    name: "verify",
    stateMutability: "nonpayable",
    inputs: [
      { name: "personId", type: "bytes32" },
      { name: "deadline", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "usdcIn", type: "uint256" },
      { name: "minPplOut", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "referrer", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "personOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "phase",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "spotPriceWad",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "openedAt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "sellBackCapToday",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "globalRemainingUsd6", type: "uint256" },
      { name: "feeLowRemainingUsd6", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "sellableNow",
    stateMutability: "view",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [{ name: "ppl", type: "uint256" }],
  },
  {
    type: "function",
    name: "sellRemaining24h",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteSellBack",
    stateMutability: "view",
    inputs: [
      { name: "holder", type: "address" },
      { name: "pplIn", type: "uint256" },
    ],
    outputs: [
      { name: "gross", type: "uint256" },
      { name: "fee", type: "uint256" },
      { name: "payout", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "lotHead",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "lotCount",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "lots",
    stateMutability: "view",
    inputs: [
      { name: "a", type: "address" },
      { name: "from", type: "uint256" },
      { name: "n", type: "uint256" },
    ],
    outputs: [
      {
        name: "out",
        type: "tuple[]",
        components: [
          { name: "boughtAt", type: "uint40" },
          { name: "boughtUsd6", type: "uint96" },
          { name: "pplRemaining", type: "uint120" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "sellBack",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pplIn", type: "uint256" },
      { name: "minUsdcOut", type: "uint256" },
      { name: "returnId", type: "bytes32" },
      { name: "deadline", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [{ name: "payout", type: "uint256" }],
  },
  {
    type: "function",
    name: "returnVerifier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
