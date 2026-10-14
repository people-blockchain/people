import { createPublicClient, http, isAddress, keccak256, type Address } from "viem";
import manifest from "@/lib/predict/deployment.json" with { type: "json" };
import { readEvmRpcUrl } from "@/lib/evm/config";
import { predictAbi } from "./abi";
import { CHAIN_ID, configuredDeployment, canonicalTrades, type Snapshot, type Market, type Order, type Trade, type Deployment } from "./model";

export async function readPredictSnapshot({ account, marketId, page = 0, orderPage = 0 }: { account?: Address; marketId?: bigint; page?: number; orderPage?: number } = {}, options: { deployment?: Deployment; rpcUrl?: string } = {}): Promise<Snapshot> {
  const deployment: Deployment = options.deployment ?? manifest;
  if (account && !isAddress(account)) throw new Error("account");
  if (![page, orderPage].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 1000000)) throw new Error("page");
  const client = createPublicClient({ transport: http(options.rpcUrl ?? readEvmRpcUrl(), { timeout: 12000, retryCount: 0 }) });
  if (await client.getChainId() !== CHAIN_ID) throw new Error("wrong_chain");
  const block = await client.getBlock();
  if (!block.hash || block.number === null) throw new Error("invalid_block");
  if (Math.abs(Date.now() / 1000 - Number(block.timestamp)) > 120) throw new Error("stale_network");
  const result: Snapshot = { status: "undeployed", chainId: CHAIN_ID, height: String(block.number), blockHash: block.hash,
    timestamp: Number(block.timestamp), contract: null, markets: [], marketCount: "0", orders: [], orderCount: "0", trades: [],
    historyFrom: null, credits: null, accountBalance: account ? String(await client.getBalance({ address: account, blockNumber: block.number })) : null,
    admin: null, page, orderPage };
  if (!configuredDeployment(deployment)) return result;
  const genesis = await client.getBlock({ blockNumber: BigInt(0) });
  if (genesis.hash?.toLowerCase() !== deployment.genesisHash.toLowerCase()) throw new Error("genesis_mismatch");
  const code = await client.getCode({ address: deployment.address, blockNumber: block.number });
  if (!code || code === "0x" || keccak256(code).toLowerCase() !== deployment.runtimeCodeHash.toLowerCase()) throw new Error("contract_mismatch");
  const read = { address: deployment.address, abi: predictAbi, blockNumber: block.number } as const;
  if (await client.readContract({ ...read, functionName: "VERSION" }) !== BigInt(1)) throw new Error("version_mismatch");
  const count = await client.readContract({ ...read, functionName: "marketCount" });
  const orderCount = await client.readContract({ ...read, functionName: "orderCount" });
  const ids: bigint[] = [];
  if (marketId !== undefined) { if (marketId < BigInt(1) || marketId > count) throw new Error("market_not_found"); ids.push(marketId); }
  else for (let id = BigInt(page * 20 + 1); id <= count && ids.length < 20; id++) ids.push(id);
  const markets: Market[] = await Promise.all(ids.map(async id => {
    const m = await client.readContract({ ...read, functionName: "getMarket", args: [id] });
    const positions = account ? await client.readContract({ ...read, functionName: "positions", args: [id, account] }) : null;
    return { ...m, id: String(id), closeAt: Number(m.closeAt), proposedAt: Number(m.proposedAt), collateral: String(m.collateral),
      ...(positions ? { yes: String(positions[0]), no: String(positions[1]) } : {}) };
  }));
  const orderIds: bigint[] = [];
  for (let id = orderCount - BigInt(orderPage * 50); id > BigInt(0) && orderIds.length < 50; id--) orderIds.push(id);
  const rows = await Promise.all(orderIds.map(async id => {
    const o = await client.readContract({ ...read, functionName: "orders", args: [id] });
    const row: Order = { id: String(id), maker: o[0], marketId: String(o[1]), yes: o[2], buy: o[3], price: String(o[4]), remaining: String(o[5]), expiresAt: Number(o[6]) };
    return row;
  }));
  // The order window is paginated, not a full depth claim. Keep expired maker orders recoverable.
  const orders = rows.filter(o => BigInt(o.remaining) > BigInt(0) && (marketId === undefined || o.marketId === String(marketId)));
  const from = block.number > BigInt(1999) ? block.number - BigInt(1999) : BigInt(0);
  const historyFrom = from > BigInt(deployment.startBlock) ? from : BigInt(deployment.startBlock);
  const logs = historyFrom <= block.number ? await client.getLogs({ address: deployment.address, event: predictAbi.find(e => e.type === "event" && e.name === "Trade")!,
    ...(marketId !== undefined ? { args: { marketId } } : {}), fromBlock: historyFrom, toBlock: block.number, strict: true }) : [];
  const trades = canonicalTrades(logs.filter(l => !l.removed).map(l => {
    const a = l.args;
    return { blockNumber: String(l.blockNumber), blockHash: l.blockHash, txHash: l.transactionHash, logIndex: l.logIndex,
      marketId: String(a.marketId), orderId: String(a.orderId), taker: a.taker, maker: a.maker, yes: a.yes, buy: a.buy,
      amount: String(a.amount), price: String(a.price), cost: String(a.cost) } as Trade;
  }));
  const credits = account ? String(await client.readContract({ ...read, functionName: "credits", args: [account] })) : null;
  const admin = await client.readContract({ ...read, functionName: "admin" });
  // Discard a mixed snapshot if the block changed during the read (reorg).
  if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error("reorg_retry");
  return { ...result, status: "ready", contract: deployment.address, markets, marketCount: String(count), orders,
    orderCount: String(orderCount), trades, historyFrom: String(historyFrom),
    credits, admin };
}
