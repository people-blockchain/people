import { expect, test, vi } from "vitest";

// Must be set before ./index.js is evaluated — limits are read at module load.
vi.hoisted(() => {
  process.env.MEMPOOL_MAX_SIZE = "20";
  process.env.MEMPOOL_ONBOARDING_MAX = "5";
});

const { DEFAULT_CONFIG, createInitialState, enqueueTransaction, generateKeyPair } = await import("./index.js");

const RECIPIENT = generateKeyPair().address;

test("MF-20: MEMPOOL_ONBOARDING_MAX overrides the default onboarding quota", () => {
  const state = createInitialState(DEFAULT_CONFIG);
  const make = (i: number) => ({
    id: `onboard-${i}`,
    chainId: state.networkConfig!.chainId,
    from: generateKeyPair().address,
    to: RECIPIENT,
    amount: 0,
    fee: 0,
    nonce: 0,
    timestamp: i,
    type: "registerParticipant" as const
  });
  for (let i = 0; i < 5; i += 1) enqueueTransaction(state, make(i) as never, false);
  expect(state.mempool).toHaveLength(5);
  expect(() => enqueueTransaction(state, make(5) as never, false)).toThrow("Onboarding mempool quota is full");
});
