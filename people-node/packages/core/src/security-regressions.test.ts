import { describe, expect, test } from "vitest";
import { chooseFork, validateAndReplayChain, DEV_FAUCET_PRIVATE_KEY, FAUCET_ADDRESS, signBlock, hashJson, pplToAtoms, DEFAULT_CONFIG, applyTransaction, buildBlock, computeStateRoot, createInitialState, enqueueTransaction, ensureAccount, generateKeyPair, signTransaction, tryApplyRemoteBlock, verifyTransaction } from "./index.js";
import { withExecutionEnvAsync, getExecutionEnv } from "./execution-env.js";

const config = () => structuredClone(DEFAULT_CONFIG);
function transaction(type: "joinValidator" | "proposal" | "transfer", fee = 0) {
  const key = generateKeyPair();
  return signTransaction(key.privateKey, { id: "security-test", from: key.address, to: key.address, type, amount: type === "joinValidator" ? 100 : 1, fee, nonce: 0, timestamp: 1 });
}

describe("security regression boundaries", () => {
  test.each(["joinValidator", "proposal", "transfer"] as const)("rejects negative fees before %s can change any state", (type) => {
    const state = createInitialState(); const before = structuredClone(state);
    const tx = transaction(type, -1000);
    expect(verifyTransaction(tx)).toBe(true);
    expect(() => enqueueTransaction(state, tx)).toThrow();
    expect(() => applyTransaction(state, tx, config())).toThrow();
    expect(state).toEqual(before);
  });
  test("mempool admission and rejected transactions do not mutate committed accounts", async () => {
    const state = createInitialState(); const receiver = structuredClone(state);
    const tx = transaction("transfer", 0.5);
    expect(() => enqueueTransaction(state, tx)).toThrow("Insufficient");
    expect(state.accounts).toEqual(receiver.accounts);
    expect(state.mempool).toHaveLength(0);
    const block = await buildBlock(state, "bootstrap-validator", config());
    expect(block.transactions).toHaveLength(0);
    expect(state.pendingValidatorFees ?? 0).toBe(0);
    expect(await tryApplyRemoteBlock(receiver, block, config())).toBe(true);
  });
  test("producer and replayer accrue the same epoch reward and accept the next block", async () => {
    const state = createInitialState(); const key = generateKeyPair();
    ensureAccount(state, key.address);
    state.validators[key.address] = {address:key.address,nodeKind:"full",status:"active",stake:100,uptimeScore:1,attestationScore:1,lastSeen:1,joinedAtEpoch:0};
    const receiver = structuredClone(state);
    for (let h = 1; h <= 11; h++) {
      const block = await buildBlock(state, key.address, config(), key.privateKey);
      expect(await tryApplyRemoteBlock(receiver, block, config())).toBe(true);
      expect(computeStateRoot(receiver)).toBe(computeStateRoot(state));
    }
    expect(state.accounts[key.address]!.balance).toBe(DEFAULT_CONFIG.epochBaseIssuance);
  });
  test("treasury and burn balances are committed to the state root", () => {
    const state = createInitialState(); const root = computeStateRoot(state);
    state.treasury!.ppl = 1; expect(computeStateRoot(state)).not.toBe(root);
    state.treasury!.ppl = 0; state.burned!.ppl = 1; expect(computeStateRoot(state)).not.toBe(root);
  });
  test("malformed public keys and signatures fail verification without throwing", () => {
    expect(verifyTransaction({...transaction("transfer"),publicKey:"not-hex",signature:"bad"})).toBe(false);
  });
  test("concurrent EVM contexts are isolated", async () => {
    const env = (n:number) => ({timestamp:n,blockNumber:n,proposer:"bootstrap-validator",chainId:`network-${n}`,remainingBlockGas:100});
    await Promise.all([1,2].map(n => withExecutionEnvAsync(env(n), async () => {
      await new Promise(resolve => setTimeout(resolve, n === 1 ? 10 : 20));
      expect(getExecutionEnv()?.blockNumber).toBe(n);
    })));
    expect(getExecutionEnv()).toBe(null);
  });
});


test("block authentication rejects unsigned, wrong-key, wrong-chain and mutated blocks without changing state", async () => {
  const cfg = config();
  const producer = createInitialState(cfg);
  const receiver = structuredClone(producer);
  const block = await buildBlock(producer, "bootstrap-validator", cfg);
  const wrongKey = generateKeyPair();
  for (const invalid of [
    {...block, signature: undefined},
    signBlock(block, wrongKey.privateKey),
    {...block, header: {...block.header, chainId: "other-network"}},
    {...block, transactions: [transaction("transfer")]}
  ]) {
    const before = structuredClone(receiver);
    expect(await tryApplyRemoteBlock(receiver, invalid, config())).toBe(false);
    expect(receiver).toEqual(before);
  }
  expect(await tryApplyRemoteBlock(receiver, block, config())).toBe(true);
});

test("a valid signature cannot replay on another network", () => {
  const tx = transaction("transfer");
  const other = createInitialState({...config(), chainId: "other-network"});
  expect(() => enqueueTransaction(other, tx)).toThrow();
  expect(verifyTransaction({...tx, chainId: "other-network"})).toBe(false);
});

test("4875 micro-PPL fee conserves all six shares and replay agrees", async () => {
  const state = createInitialState();
  const key = generateKeyPair();
  state.validators[key.address] = {address:key.address,nodeKind:"full",status:"active",stake:100,uptimeScore:1,attestationScore:1,lastSeen:1,joinedAtEpoch:0};
  ensureAccount(state, key.address);
  const receiver = structuredClone(state);
  const recipient = generateKeyPair();
  const tx = signTransaction(DEV_FAUCET_PRIVATE_KEY, {id:"fractional-conservation",from:FAUCET_ADDRESS,to:recipient.address,amount:1,fee:0.004875,nonce:0,timestamp:1,type:"transfer"});
  enqueueTransaction(state, tx);
  const block = await buildBlock(state,key.address,config(),key.privateKey);
  expect(block.transactions).toHaveLength(1);
  expect(await tryApplyRemoteBlock(receiver,block,config())).toBe(true);
  const shares = [pplToAtoms(state.accounts[key.address]!.balance), pplToAtoms(state.communityPool.pools.ppl!.remainingBalance), pplToAtoms(state.treasury!.ppl!), state.feeLiquidityEcosystem, state.growthPool.totalInflow, pplToAtoms(state.burned!.ppl!)];
  expect(shares).toEqual([1464,1218,975,487,731,0]);
  expect(shares.reduce((a,b)=>a+b,0)).toBe(4875);
  expect(computeStateRoot(state)).toBe(computeStateRoot(receiver));
});

test("rejected signed block rolls back all prior transactions and keeps the mempool", async () => {
  const state = createInitialState();
  const producer = structuredClone(state);
  const key = generateKeyPair();
  enqueueTransaction(producer,signTransaction(DEV_FAUCET_PRIVATE_KEY,{id:"first",from:FAUCET_ADDRESS,to:key.address,amount:1,fee:0,nonce:0,timestamp:1,type:"transfer"}));
  const block = await buildBlock(producer,"bootstrap-validator",config());
  block.header.stateRoot = "invalid";
  block.hash = hashJson({header:block.header,transactions:block.transactions});
  const signed = signBlock(block,process.env.BOOTSTRAP_PRIVATE_KEY!);
  const before = structuredClone(state);
  expect(await tryApplyRemoteBlock(state,signed,config())).toBe(false);
  expect(state).toEqual(before);
});


test("a longer valid branch cannot replace finalized history", async () => {
  const local = createInitialState();
  const remote = createInitialState();
  await buildBlock(local,"bootstrap-validator",config());
  const recipient = generateKeyPair();
  enqueueTransaction(remote,signTransaction(DEV_FAUCET_PRIVATE_KEY,{id:"alternate-branch",from:FAUCET_ADDRESS,to:recipient.address,amount:1,fee:0,nonce:0,timestamp:1,type:"transfer"}));
  await buildBlock(remote,"bootstrap-validator",config());
  await buildBlock(remote,"bootstrap-validator",config());
  expect(await validateAndReplayChain(remote.chain,config())).not.toBeNull();
  expect(await chooseFork(local,remote.chain,config())).not.toBeNull();
  local.finalizedHeight = 1;
  expect(await chooseFork(local,remote.chain,config())).toBeNull();
});
