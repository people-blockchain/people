import { expect, test, vi } from "vitest";

// Must be set before ./index.js is evaluated — limits are read at module load.
// Pool of 20 => default onboarding quota of 2 (10%).
vi.hoisted(() => {
  process.env.MEMPOOL_MAX_SIZE = "20";
  delete process.env.MEMPOOL_ONBOARDING_MAX;
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
let counter = 0;

function paidTx(state: ChainState, fee: number) {
  const key = generateKeyPair();
  setAccountBalance(ensureAccount(state, key.address), NATIVE_ASSET_ID, 100);
  counter += 1;
  return signTransaction(key.privateKey, {
    id: `paid-${counter}`,
    chainId: state.networkConfig!.chainId,
    from: key.address,
    to: RECIPIENT,
    amount: 1,
    fee,
    nonce: 0,
    timestamp: 1,
    type: "transfer"
  });
}

function onboardingTx(state: ChainState, type: "registerParticipant" | "participantReferral" = "registerParticipant") {
  const key = generateKeyPair();
  counter += 1;
  return {
    id: `onboard-${counter}`,
    chainId: state.networkConfig!.chainId,
    from: key.address,
    to: RECIPIENT,
    amount: 0,
    fee: 0,
    nonce: 0,
    timestamp: counter,
    type
  };
}

const onboardingCount = (state: ChainState) =>
  state.mempool.filter((tx) => tx.type === "registerParticipant" || tx.type === "participantReferral").length;

test("MF-20: onboarding transactions are capped at 10% of the mempool by default", () => {
  const state = createInitialState(DEFAULT_CONFIG);
  const first = onboardingTx(state);
  enqueueTransaction(state, first as never, false);
  enqueueTransaction(state, onboardingTx(state) as never, false);

  const before = structuredClone(state.mempool);
  expect(() => enqueueTransaction(state, onboardingTx(state) as never, false)).toThrow(
    "Onboarding mempool quota is full"
  );
  // Rejected, not swapped in: the already accepted (oldest) transaction stays.
  expect(state.mempool).toEqual(before);
  expect(state.mempool[0]!.id).toBe(first.id);
});

test("MF-20: the quota applies across both onboarding transaction types", () => {
  const state = createInitialState(DEFAULT_CONFIG);
  enqueueTransaction(state, onboardingTx(state) as never, false);
  const referral = onboardingTx(state, "participantReferral");
  state.participants[referral.from] = {} as never;
  enqueueTransaction(state, referral as never, false);
  expect(onboardingCount(state)).toBe(2);
  expect(() => enqueueTransaction(state, onboardingTx(state) as never, false)).toThrow(
    "Onboarding mempool quota is full"
  );
});

test("MF-20: an onboarding flood never blocks paid transactions", () => {
  const state = createInitialState(DEFAULT_CONFIG);
  for (let i = 0; i < 50; i += 1) {
    try {
      enqueueTransaction(state, onboardingTx(state) as never, false);
    } catch {
      /* quota reached */
    }
  }
  expect(onboardingCount(state)).toBe(2);
  for (let i = 0; i < 18; i += 1) {
    enqueueTransaction(state, paidTx(state, 0.005));
  }
  expect(state.mempool).toHaveLength(20);
});

test("MF-20: a paid transaction at a full pool evicts the oldest onboarding transaction", () => {
  const state = createInitialState(DEFAULT_CONFIG);
  const oldest = onboardingTx(state);
  const newer = onboardingTx(state);
  enqueueTransaction(state, oldest as never, false);
  enqueueTransaction(state, newer as never, false);
  for (let i = 0; i < 18; i += 1) enqueueTransaction(state, paidTx(state, 0.01));
  expect(state.mempool).toHaveLength(20);

  // Fee equal to the cheapest paid transaction: still admitted, because onboarding yields first.
  const incoming = paidTx(state, 0.01);
  enqueueTransaction(state, incoming);

  expect(state.mempool).toHaveLength(20);
  expect(state.mempool.some((tx) => tx.id === oldest.id)).toBe(false);
  expect(state.mempool.some((tx) => tx.id === newer.id)).toBe(true);
  expect(state.mempool.some((tx) => tx.id === incoming.id)).toBe(true);
  expect(onboardingCount(state)).toBe(1);
});

test("MF-20: with no onboarding left the paid-fee eviction rule is unchanged", () => {
  const state = createInitialState(DEFAULT_CONFIG);
  for (let i = 0; i < 20; i += 1) enqueueTransaction(state, paidTx(state, 0.01));
  expect(() => enqueueTransaction(state, paidTx(state, 0.01))).toThrow("Mempool is full");
  enqueueTransaction(state, paidTx(state, 0.02));
  expect(state.mempool).toHaveLength(20);
});

test("MF-20: onboarding is refused (not evicting paid transactions) when the whole pool is full", () => {
  const state = createInitialState(DEFAULT_CONFIG);
  for (let i = 0; i < 20; i += 1) enqueueTransaction(state, paidTx(state, 0.01));
  expect(() => enqueueTransaction(state, onboardingTx(state) as never, false)).toThrow("Mempool is full");
  expect(state.mempool.every((tx) => tx.type === "transfer")).toBe(true);
});
