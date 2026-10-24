// VERIFY against the published PplCurveHub source on Basescan before enabling the sale.
// Names and signatures below are an assumption: the contract source is not part of this repo.
export const pplCurveHubAbi = [
  {
    type: "function",
    name: "buyWith",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "minPplOut", type: "uint256" },
    ],
    outputs: [{ name: "pplOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteBuy",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ name: "pplOut", type: "uint256" }],
  },
  {
    type: "event",
    name: "Bought",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "pplOut", type: "uint256", indexed: false },
    ],
  },
] as const;
