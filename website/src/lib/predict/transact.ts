import { createPublicClient, createWalletClient, custom, http, encodeFunctionData, keccak256, type Address, type Hex } from "viem";
import manifest from "@/lib/predict/deployment.json" with { type: "json" };
import { predictAbi } from "./abi";
import { CHAIN_ID, configuredDeployment, type Deployment } from "./model";
import { verifiedAccount, type PredictProvider } from "./wallet";
export type PredictAction = "split" | "merge" | "placeOrder" | "fillOrder" | "cancelOrder" | "propose" | "dispute" | "finalize" | "redeem" | "withdraw" | "createMarket";
export async function sendPredictTransaction(provider: PredictProvider, expectedAccount: Address, action: PredictAction, args: readonly unknown[], value = BigInt(0), deployment: Deployment = manifest): Promise<Hex> {
  const d: Deployment = deployment;
  if (!configuredDeployment(d)) throw new Error("undeployed");
  const account = await verifiedAccount(provider);
  if (account.toLowerCase() !== expectedAccount.toLowerCase()) throw new Error("account_changed");
  const walletGenesis = await provider.request({ method: "eth_getBlockByNumber", params: ["0x0", false] }) as { hash?: string } | null;
  if (walletGenesis?.hash?.toLowerCase() !== d.genesisHash.toLowerCase()) throw new Error("genesis_mismatch");
  const walletCode = await provider.request({ method: "eth_getCode", params: [d.address, "latest"] });
  if (typeof walletCode !== "string" || !/^0x[0-9a-f]+$/i.test(walletCode) || keccak256(walletCode as Hex).toLowerCase() !== d.runtimeCodeHash.toLowerCase()) throw new Error("contract_mismatch");
  const chain = { id: CHAIN_ID, name: "PEOPLE Blockchain testnet", nativeCurrency: { name: "People", symbol: "PPL", decimals: 18 }, rpcUrls: { default: { http: ["/api/evm/rpc"] } } } as const;
  const client = createPublicClient({ chain, transport: http("/api/evm/rpc", { retryCount: 0 }) });
  if (await client.getChainId() !== CHAIN_ID) throw new Error("wrong_chain");
  const block = await client.getBlock();
  if (Math.abs(Date.now() / 1000 - Number(block.timestamp)) > 120) throw new Error("stale_network");
  if ((await client.getBlock({ blockNumber: BigInt(0) })).hash?.toLowerCase() !== d.genesisHash.toLowerCase()) throw new Error("genesis_mismatch");
  const code = await client.getCode({ address: d.address });
  if (!code || code === "0x" || keccak256(code).toLowerCase() !== d.runtimeCodeHash.toLowerCase()) throw new Error("contract_mismatch");
  // Runtime arguments are validated by the contract call before the wallet is asked to sign.
  const data = encodeFunctionData({ abi: predictAbi, functionName: action, args } as never);
  await client.call({ account, to: d.address, data, value });
  const current = await verifiedAccount(provider);
  if (current.toLowerCase() !== account.toLowerCase()) throw new Error("account_changed");
  return createWalletClient({ account, chain, transport: custom(provider) }).sendTransaction({ to: d.address, data, value });
}
