#!/usr/bin/env node
/**
 * Testnet-only: launch a tiny token with leftoverMode = Burn (0) via the new TokenFactory.
 * Uses ~/.secrets/people-testnet-deployer-v2.key — never prints the key.
 */
import { readFileSync } from "node:fs";
import { createWalletClient, createPublicClient, http, parseAbi, formatEther, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.EVM_RPC_URL || "https://node.peopleblockchain.network/rpc";
const dep = JSON.parse(readFileSync(new URL("../deployments/97401.json", import.meta.url), "utf8"));
const factory = dep.contracts.tokenFactory;
const curve = dep.contracts.bondingCurve;
const pkRaw = readFileSync(`${process.env.HOME}/.secrets/people-testnet-deployer-v2.key`, "utf8").trim();
const account = privateKeyToAccount(pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`);

const chain = {
  id: 97401,
  name: "People Testnet",
  nativeCurrency: { name: "PPL", symbol: "PPL", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const abi = parseAbi([
  "function createToken(string name, string symbol, uint8 decimals, uint256 totalSupply, string metadataURI, uint16 promoBps, uint8 leftoverMode) payable returns (address)",
  "function tokenCreateFee() view returns (uint256)",
  "function leftoverMode(address) view returns (uint8)",
  "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint8 decimals, uint256 totalSupply, (uint256 bondingCurve, uint256 communityPool, uint256 creator, uint256 liquidityReserve, uint256 ecosystemReserve) allocation, uint8 leftoverMode)",
]);

const curveAbi = parseAbi(["function leftoverMode(address) view returns (uint8)"]);

const publicClient = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

const fee = await publicClient.readContract({ address: factory, abi, functionName: "tokenCreateFee" });
const bal = await publicClient.getBalance({ address: account.address });
console.log("deployer", account.address);
console.log("factory", factory);
console.log("fee_ppl", formatEther(fee));
console.log("balance_ppl", formatEther(bal));

const hash = await wallet.writeContract({
  address: factory,
  abi,
  functionName: "createToken",
  args: ["BurnModeProbe", "BURNP", 6, 1_000_000n, "ipfs://people/burnp-probe", 0, 0],
  value: fee,
});
console.log("tx", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("status", receipt.status, "block", receipt.blockNumber);

let token = null;
for (const log of receipt.logs) {
  try {
    const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
    if (decoded.eventName === "TokenCreated") {
      token = decoded.args.token;
      console.log("token", token);
      console.log("event_leftoverMode", Number(decoded.args.leftoverMode));
    }
  } catch {
    /* not our event */
  }
}
if (!token) {
  console.error("TokenCreated not found");
  process.exit(1);
}
const mode = await publicClient.readContract({
  address: curve,
  abi: curveAbi,
  functionName: "leftoverMode",
  args: [token],
});
console.log("curve_leftoverMode", Number(mode));
if (Number(mode) !== 0) {
  console.error("expected Burn (0)");
  process.exit(1);
}
console.log("OK burn launch");
