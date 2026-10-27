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
] as const;

export const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
