import { expect, test, vi } from "vitest";

// Must be set before ./index.js is evaluated — the size limit is read at module load.
vi.hoisted(() => {
  process.env.MEMPOOL_MAX_SIZE = "3";
});

const {
  DEFAULT_CONFIG,
  NATIVE_ASSET_ID,
  createInitialState,
  enqueueTransaction,
  ensureAccount,
  generateKeyPair,
  setAccountBalance,
  signTransaction
} = await import("./index.js");
type ChainState = Awaited<ReturnType<typeof createInitialState>>;

const RECIPIENT = generateKeyPair().address;

function fundedTx(state: ChainState, fee: number, amount = 1) {
  const key = generateKeyPair();
  setAccountBalance(ensureAccount(state, key.address), NATIVE_ASSET_ID, 100);
  return signTransaction(key.privateKey, {
    id: `${key.address}-${fee}`,
    chainId: state.networkConfig!.chainId,
    from: key.address,
    to: RECIPIENT,
    amount,
    fee,
    nonce: 0,
    timestamp: 1,
    type: "transfer"
  });
}

function onboardingTx(state: ChainState, index: number) {
  const key = generateKeyPair();
  return {
    id: `onboard-${index}`,
    chainId: state.networkConfig!.chainId,
    from: key.address,
    to: RECIPIENT,
    amount: 0,
    fee: 0,
    nonce: 0,
    timestamp: 1,
    type: "registerParticipant" as const
  };
}

test("M13-3: a full mempool evicts its cheapest transaction for a higher-fee newcomer", () => {
  const state = createInitialState(DEFAULT_CONFIG);
  for (const fee of [0.005, 0.006, 0.007]) {
    enqueueTransaction(state, fundedTx(state, fee));
  }
  expect(state.mempool).toHaveLength(3);

  const newcomer = fundedTx(state, 0.008);
  enqueueTransaction(state, newcomer);

  expect(state.mempool).toHaveLength(3);
  expect(state.mempool.map((tx) => tx.fee).sort((a, b) => a - b)).toEqual([0.006, 0.007, 0.008]);
  expect(state.mempool.some((tx) => tx.id === newcomer.id)).toBe(true);
});

test("M13-3: a newcomer that does not outbid the cheapest is refused, leaving state untouched", () => {
  const state = createInitialState(DEFAULT_CONFIG);
  for (const fee of [0.005, 0.006, 0.007]) {
    enqueueTransaction(state, fundedTx(state, fee));
  }

  const before = structuredClone(state.mempool);
  expect(() => enqueueTransaction(state, fundedTx(state, 0.005))).toThrow("Mempool is full");
  expect(state.mempool).toEqual(before);
});

test("MF-20: a paid transaction evicts the oldest onboarding transaction instead of being refused", () => {
  const state = createInitialState(DEFAULT_CONFIG);
  // Quota is 1 at MEMPOOL_MAX_SIZE=3, so fill the rest with paid transactions.
  enqueueTransaction(state, onboardingTx(state, 0) as never, false);
  enqueueTransaction(state, fundedTx(state, 0.005));
  enqueueTransaction(state, fundedTx(state, 0.006));
  expect(state.mempool).toHaveLength(3);

  const newcomer = fundedTx(state, 0.005);
  enqueueTransaction(state, newcomer);

  expect(state.mempool).toHaveLength(3);
  expect(state.mempool.some((tx) => tx.type === "registerParticipant")).toBe(false);
  expect(state.mempool.some((tx) => tx.id === newcomer.id)).toBe(true);
});
