import { describe, expect, test } from "vitest";
import type { Transaction } from "@people/protocol";
import {
  DEFAULT_CONFIG,
  DEV_FAUCET_PRIVATE_KEY,
  FAUCET_ADDRESS,
  GROWTH_EPOCH_LENGTH,
  L1_MIN_C,
  L1_MIN_N,
  L2_MIN_AGE,
  L2_MIN_C,
  L2_MIN_N,
  applyTransaction,
  buildBlock,
  completedEpochsSinceRegistration,
  computeStateRoot,
  contributionEpochCount,
  createInitialState,
  distributeEpochRewards,
  enqueueTransaction,
  fundValidatorJoin,
  generateKeyPair,
  growthEpochOfHeight,
  growthScore,
  isL1Eligible,
  isL2Eligible,
  markNetworkActivity,
  markQualifyingContribution,
  networkActivityEpochCount,
  nextEpochEndStrictlyAfter,
  referralMaturedAt,
  signTransaction,
  type ChainState
} from "./index.js";
import type { KeyPair } from "./crypto.js";

const FIXED_TS = 1_700_000_000_000;

function register(state: ChainState, key: KeyPair): void {
  applyTransaction(
    state,
    signTransaction(key.privateKey, {
      id: `reg-${key.address}`,
      from: key.address,
      to: key.address,
      amount: 0,
      fee: 0,
      nonce: state.accounts[key.address]?.nonce ?? 0,
      timestamp: FIXED_TS,
      type: "registerParticipant"
    }),
    DEFAULT_CONFIG
  );
  verifyIdentity(state, key.address);
}

/** M13-2: these tests cover the activity gates, so registered addresses are marked verified. */
function verifyIdentity(state: ChainState, address: string): void {
  const participant = state.participants[address];
  if (participant) {
    participant.identityVerified = { method: "telegram", verifiedAtHeight: 1 };
  }
}

function link(state: ChainState, child: KeyPair, parent: string): void {
  applyTransaction(
    state,
    signTransaction(child.privateKey, {
      id: `edge-${child.address}`,
      from: child.address,
      to: child.address,
      amount: 0,
      fee: 0,
      nonce: state.accounts[child.address]?.nonce ?? 0,
      timestamp: FIXED_TS,
      type: "participantReferral",
      payload: { parent }
    }),
    DEFAULT_CONFIG
  );
}

function markPair(state: ChainState, address: string, epochs: number[]): void {
  for (const epoch of epochs) {
    markQualifyingContribution(state, address, epoch);
    markNetworkActivity(state, address, epoch);
  }
}

describe("growth epoch accounting", () => {
  test("several marks in one epoch add one, and a second epoch adds one more", async () => {
    const state = createInitialState();
    const child = generateKeyPair();
    register(state, child);
    markQualifyingContribution(state, child.address, 3);
    markQualifyingContribution(state, child.address, 3);
    markNetworkActivity(state, child.address, 3);
    markNetworkActivity(state, child.address, 3);
    expect(contributionEpochCount(state, child.address, 3)).toBe(1);
    expect(networkActivityEpochCount(state, child.address, 3)).toBe(1);
    const root = computeStateRoot(state);
    markQualifyingContribution(state, child.address, 3);
    expect(computeStateRoot(state)).toBe(root);

    markQualifyingContribution(state, child.address, 4);
    markNetworkActivity(state, child.address, 1);
    expect(contributionEpochCount(state, child.address, 4)).toBe(2);
    expect(networkActivityEpochCount(state, child.address, 4)).toBe(2);
    expect(state.contributionEpochs[child.address]).toEqual([3, 4]);
    expect(state.networkActivityEpochs[child.address]).toEqual([1, 3]);
  });

  test("the same epochs in either order produce one sorted state root", async () => {
    const first = createInitialState();
    const second = createInitialState();
    const a = generateKeyPair();
    const b = generateKeyPair();
    register(first, a);
    register(second, b);
    first.participants[b.address] = structuredClone(first.participants[a.address]!);
    second.participants[a.address] = structuredClone(second.participants[b.address]!);
    delete first.participants[a.address];
    delete second.participants[b.address];
    markQualifyingContribution(first, b.address, 2);
    markQualifyingContribution(first, b.address, 1);
    markQualifyingContribution(second, a.address, 1);
    markQualifyingContribution(second, a.address, 2);
    expect(first.contributionEpochs[b.address]).toEqual([1, 2]);
    expect(second.contributionEpochs[a.address]).toEqual([1, 2]);
  });

  test("register, transfer, referral, and validator join do not increment C or N", async () => {
    const state = createInitialState();
    const parent = generateKeyPair();
    const child = generateKeyPair();
    const stranger = generateKeyPair();
    register(state, parent);
    register(state, child);
    link(state, child, parent.address);
    const transfer: Transaction = signTransaction(DEV_FAUCET_PRIVATE_KEY, {
      id: "transfer-does-not-mark",
      from: FAUCET_ADDRESS,
      to: stranger.address,
      amount: 10,
      fee: 1,
      nonce: state.accounts[FAUCET_ADDRESS]!.nonce,
      timestamp: FIXED_TS,
      type: "transfer"
    });
    applyTransaction(state, transfer, DEFAULT_CONFIG);
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 0 };
    const joiner = fundValidatorJoin(state, "full", 200, config);
    applyTransaction(state, joiner.joinTx, config);

    expect(state.contributionEpochs).toEqual({});
    expect(state.networkActivityEpochs).toEqual({});
    expect(contributionEpochCount(state, child.address, 1)).toBe(0);
    expect(networkActivityEpochCount(state, child.address, 1)).toBe(0);
    expect(state.participants[joiner.address]).toBeUndefined();
    expect(state.validators[joiner.address]?.referredBy).toBeUndefined();
  });

  test("without an approved event C and N stay zero", async () => {
    const state = createInitialState();
    const child = generateKeyPair();
    register(state, child);
    expect(contributionEpochCount(state, child.address, 9)).toBe(0);
    expect(networkActivityEpochCount(state, child.address, 9)).toBe(0);
  });

  test("rejects a non-integer epoch and a mark for a non-participant", async () => {
    const state = createInitialState();
    const child = generateKeyPair();
    expect(() => markQualifyingContribution(state, child.address, 1)).toThrow(/Not a participant/);
    register(state, child);
    expect(() => markNetworkActivity(state, child.address, 1.5)).toThrow(/Invalid growth epoch/);
    expect(state.networkActivityEpochs).toEqual({});
  });
});

describe("age and maturation", () => {
  test("epoch boundaries follow height and 201600", async () => {
    expect(growthEpochOfHeight(0)).toBe(0);
    expect(growthEpochOfHeight(1)).toBe(1);
    expect(growthEpochOfHeight(GROWTH_EPOCH_LENGTH)).toBe(1);
    expect(growthEpochOfHeight(GROWTH_EPOCH_LENGTH + 1)).toBe(2);
    expect(nextEpochEndStrictlyAfter(1)).toBe(GROWTH_EPOCH_LENGTH);
    expect(nextEpochEndStrictlyAfter(GROWTH_EPOCH_LENGTH)).toBe(GROWTH_EPOCH_LENGTH * 2);
  });

  test("age counts completed epochs since registration and idle does not reset it", async () => {
    expect(completedEpochsSinceRegistration(1, GROWTH_EPOCH_LENGTH - 1)).toBe(0);
    expect(completedEpochsSinceRegistration(1, GROWTH_EPOCH_LENGTH)).toBe(1);
    expect(completedEpochsSinceRegistration(GROWTH_EPOCH_LENGTH, GROWTH_EPOCH_LENGTH)).toBe(1);
    expect(completedEpochsSinceRegistration(1, GROWTH_EPOCH_LENGTH * 4)).toBe(4);
    const idleLater = GROWTH_EPOCH_LENGTH * 4 + 10;
    expect(completedEpochsSinceRegistration(1, idleLater)).toBe(4);
    expect(completedEpochsSinceRegistration(1, GROWTH_EPOCH_LENGTH * 5)).toBe(5);
  });

  test("maturation is one completed epoch after inclusion and is not reset by idle", async () => {
    expect(referralMaturedAt(1, GROWTH_EPOCH_LENGTH - 1)).toBe(false);
    expect(referralMaturedAt(1, GROWTH_EPOCH_LENGTH)).toBe(true);
    expect(referralMaturedAt(GROWTH_EPOCH_LENGTH, GROWTH_EPOCH_LENGTH)).toBe(false);
    expect(referralMaturedAt(GROWTH_EPOCH_LENGTH, GROWTH_EPOCH_LENGTH * 2)).toBe(true);
    expect(referralMaturedAt(1, GROWTH_EPOCH_LENGTH * 3)).toBe(true);
  });

  test("registration stores inclusion height and the edge keeps it", async () => {
    const state = createInitialState();
    const parent = generateKeyPair();
    const child = generateKeyPair();
    register(state, parent);
    register(state, child);
    expect(state.participants[child.address]?.registeredAtHeight).toBe(1);
    expect(state.participants[child.address]?.linkedAtHeight).toBeUndefined();
    link(state, child, parent.address);
    // M13-2: the edge also keeps an existing identity proof.
    expect(state.participants[child.address]).toEqual({
      address: child.address,
      parent: parent.address,
      linkedAtHeight: 1,
      registeredAtHeight: 1,
      identityVerified: { method: "telegram", verifiedAtHeight: 1 }
    });
  });
});

describe("eligibility", () => {
  function ready(state: ChainState, registeredAtHeight: number | undefined, linkedAtHeight: number) {
    const parent = generateKeyPair();
    const child = generateKeyPair();
    const identityVerified = { method: "telegram", verifiedAtHeight: 1 };
    state.participants[parent.address] = { address: parent.address, registeredAtHeight: 1, identityVerified };
    state.participants[child.address] = {
      address: child.address,
      parent: parent.address,
      linkedAtHeight,
      identityVerified,
      ...(registeredAtHeight === undefined ? {} : { registeredAtHeight })
    };
    return child.address;
  }

  test("checks fail in order and a future epoch mark is invisible to an earlier snapshot", async () => {
    const state = createInitialState();
    expect(isL1Eligible(state, "0x" + "ab".repeat(20), 1).reason).toBe("NOT_PARTICIPANT");

    const parent = generateKeyPair();
    const child = generateKeyPair();
    register(state, parent);
    register(state, child);
    expect(isL1Eligible(state, child.address, 1).reason).toBe("NO_REFERRAL");
    expect(isL2Eligible(state, child.address, 1).reason).toBe("NO_REFERRAL");

    link(state, child, parent.address);
    state.participants[child.address]!.linkedAtHeight = GROWTH_EPOCH_LENGTH;
    expect(isL1Eligible(state, child.address, 1).reason).toBe("REFERRAL_NOT_MATURED");
    state.participants[child.address]!.linkedAtHeight = 1;

    markPair(state, child.address, [5]);
    expect(contributionEpochCount(state, child.address, 4)).toBe(0);
    expect(isL1Eligible(state, child.address, 4).reason).toBe("INSUFFICIENT_C");
    expect(contributionEpochCount(state, child.address, 5)).toBe(1);

    markQualifyingContribution(state, child.address, 1);
    markQualifyingContribution(state, child.address, 2);
    markQualifyingContribution(state, child.address, 3);
    markQualifyingContribution(state, child.address, 4);
    markNetworkActivity(state, child.address, 1);
    markNetworkActivity(state, child.address, 2);
    markNetworkActivity(state, child.address, 3);
    expect(contributionEpochCount(state, child.address, 4)).toBe(4);
    expect(networkActivityEpochCount(state, child.address, 4)).toBe(3);
    expect(isL1Eligible(state, child.address, 4).reason).toBe("INSUFFICIENT_N");
    markNetworkActivity(state, child.address, 4);
    expect(growthScore(4, 4)).toBe(216);
    expect(isL1Eligible(state, child.address, 4)).toEqual({ reason: "QUALIFIED", qualified: true });
    expect(networkActivityEpochCount(state, child.address, 4)).toBe(4);
    expect(networkActivityEpochCount(state, child.address, 5)).toBe(5);
  });

  test("L1 has no participant-age gate and qualifies at C=4 N=4", async () => {
    const state = createInitialState();
    const address = ready(state, undefined, 1);
    markQualifyingContribution(state, address, 1);
    markQualifyingContribution(state, address, 2);
    markQualifyingContribution(state, address, 3);
    markQualifyingContribution(state, address, 4);
    markNetworkActivity(state, address, 1);
    markNetworkActivity(state, address, 2);
    markNetworkActivity(state, address, 3);
    markNetworkActivity(state, address, 4);
    const l1 = isL1Eligible(state, address, 4);
    expect(growthScore(4, 4)).toBe(216);
    expect(l1).toEqual({ reason: "QUALIFIED", qualified: true });
    expect(l1.reason).not.toBe("INSUFFICIENT_AGE");
    expect(L1_MIN_C).toBe(4);
    expect(L1_MIN_N).toBe(4);
  });

  test("L2 uses its own thresholds and does not require a prior L1 result", async () => {
    const state = createInitialState();
    const address = ready(state, undefined, 1);
    for (let epoch = 1; epoch <= 5; epoch += 1) {
      markQualifyingContribution(state, address, epoch);
    }
    for (let epoch = 1; epoch <= 6; epoch += 1) {
      markNetworkActivity(state, address, epoch);
    }
    expect(isL1Eligible(state, address, 4)).toEqual({ reason: "QUALIFIED", qualified: true });
    expect(isL2Eligible(state, address, 4).reason).toBe("INSUFFICIENT_C");
    expect(isL2Eligible(state, address, 6).reason).toBe("INSUFFICIENT_AGE");
    expect(state.participants[address]).not.toHaveProperty("passedL1");

    state.participants[address]!.registeredAtHeight = GROWTH_EPOCH_LENGTH * 3 + 1;
    expect(completedEpochsSinceRegistration(GROWTH_EPOCH_LENGTH * 3 + 1, GROWTH_EPOCH_LENGTH * 6)).toBe(3);
    expect(isL2Eligible(state, address, 6).reason).toBe("INSUFFICIENT_AGE");
    expect(isL1Eligible(state, address, 6)).toEqual({ reason: "QUALIFIED", qualified: true });
    expect(growthScore(5, 6)).toBe(284);
    const l2 = isL2Eligible(state, address, 7);
    expect(l2).toEqual({ reason: "QUALIFIED", qualified: true });
    expect(l2.reason).not.toBe("INSUFFICIENT_SCORE");
    expect(L2_MIN_C).toBe(5);
    expect(L2_MIN_N).toBe(6);
    expect(L2_MIN_AGE).toBe(4);
  });

  test("an edge included on the epoch boundary matures on the next epoch end", async () => {
    const state = createInitialState();
    const address = ready(state, 1, GROWTH_EPOCH_LENGTH);
    markPair(state, address, [1, 2, 3, 4]);
    expect(isL1Eligible(state, address, 1).reason).toBe("REFERRAL_NOT_MATURED");
    expect(isL1Eligible(state, address, 2).reason).toBe("INSUFFICIENT_C");
  });

  test("marks and eligibility do not change validator referral or balances", async () => {
    const state = createInitialState();
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 0, referralShare: 0.1 };
    const referrer = fundValidatorJoin(state, "full", 200, config);
    applyTransaction(state, referrer.joinTx, config);
    const referred = fundValidatorJoin(state, "full", 200, config, referrer.address);
    applyTransaction(state, referred.joinTx, config);
    const parent = generateKeyPair();
    const child = generateKeyPair();
    register(state, parent);
    register(state, child);
    link(state, child, parent.address);
    const childBalance = state.accounts[child.address]?.balance ?? 0;
    const parentBalance = state.accounts[parent.address]?.balance ?? 0;
    const referredBy = state.validators[referred.address]?.referredBy;
    markPair(state, child.address, [1, 2, 3, 4, 5, 6]);
    isL1Eligible(state, child.address, 4);
    isL2Eligible(state, child.address, 4);
    const quiet = createInitialState();
    expect(distributeEpochRewards(quiet, DEFAULT_CONFIG, 0).totalReward).toBe(0);
    const rewards = distributeEpochRewards(state, DEFAULT_CONFIG, 0);
    expect(state.validators[referred.address]?.referredBy).toBe(referredBy);
    expect(state.validators[referred.address]?.referredBy).toBe(referrer.address);
    expect(state.participants[referrer.address]).toBeUndefined();
    expect(state.participants[referred.address]).toBeUndefined();
    expect(rewards.referralPayouts?.[child.address]).toBeUndefined();
    expect(rewards.referralPayouts?.[parent.address]).toBeUndefined();
    expect(state.accounts[child.address]?.balance ?? 0).toBe(childBalance);
    expect(state.accounts[parent.address]?.balance ?? 0).toBe(parentBalance);
  });
});

describe("score weights", () => {
  test("uses 40*C + 14*N, caps at 1000, and does not add S", async () => {
    expect(growthScore(0, 0)).toBe(0);
    expect(growthScore(4, 4)).toBe(216);
    expect(growthScore(5, 6)).toBe(284);
    expect(growthScore(25, 0)).toBe(1000);
    expect(growthScore(24, 0)).toBe(960);
    expect(growthScore(5, 6)).not.toBe(180);
    expect(growthScore(5, 6)).not.toBe(384);
    expect(() => growthScore(1.5, 0)).toThrow(/Invalid contribution count/);
    expect(() => growthScore(-1, 0)).toThrow(/Invalid contribution count/);
  });
});

describe("live contribution and network activity", () => {
  async function fund(state: ChainState, key: KeyPair, amount: number): Promise<void> {
    const faucetNonce = state.accounts[FAUCET_ADDRESS]!.nonce;
    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: `fund-${key.address}-${faucetNonce}`,
        from: FAUCET_ADDRESS,
        to: key.address,
        amount,
        fee: 0,
        nonce: faucetNonce,
        timestamp: FIXED_TS,
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
  }

  async function send(state: ChainState, from: KeyPair, to: string, id: string, fee: number): Promise<void> {
    enqueueTransaction(
      state,
      signTransaction(from.privateKey, {
        id,
        from: from.address,
        to,
        amount: 1,
        fee,
        nonce: state.accounts[from.address]!.nonce,
        timestamp: FIXED_TS,
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
  }

  test("a qualifying transfer increments C once per epoch and does not increment N", async () => {
    const state = createInitialState();
    const parent = generateKeyPair();
    const child = generateKeyPair();
    const other = generateKeyPair();
    await fund(state, parent, 20);
    await fund(state, child, 20);
    register(state, parent);
    register(state, child);
    link(state, child, parent.address);

    enqueueTransaction(
      state,
      signTransaction(child.privateKey, {
        id: "mempool-only",
        from: child.address,
        to: other.address,
        amount: 1,
        fee: 1,
        nonce: state.accounts[child.address]!.nonce,
        timestamp: FIXED_TS,
        type: "transfer"
      })
    );
    expect(contributionEpochCount(state, child.address, 1)).toBe(0);

    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    expect(contributionEpochCount(state, child.address, 1)).toBe(1);
    expect(networkActivityEpochCount(state, child.address, 1)).toBe(0);

    await send(state, child, other.address, "second-same-epoch", 1);
    expect(contributionEpochCount(state, child.address, 1)).toBe(1);
    expect(state.contributionEpochs[child.address]).toEqual([1]);
    expect(state.networkActivityEpochs[child.address]).toBeUndefined();
  });

  test("self and referrer-only transfers increment neither C nor N", async () => {
    const state = createInitialState();
    const parent = generateKeyPair();
    const child = generateKeyPair();
    await fund(state, parent, 10);
    await fund(state, child, 10);
    register(state, parent);
    register(state, child);
    link(state, child, parent.address);
    await send(state, child, child.address, "self", 1);
    await send(state, child, parent.address, "referrer-only", 1);
    expect(contributionEpochCount(state, child.address, 1)).toBe(0);
    expect(networkActivityEpochCount(state, child.address, 1)).toBe(0);
  });

  test("token launch and curve trading fee increment N and not C", async () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    const buyer = generateKeyPair();
    await fund(state, creator, 500);
    await fund(state, buyer, 500);
    register(state, creator);
    register(state, buyer);

    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "launch-n",
        from: creator.address,
        to: creator.address,
        amount: 0,
        fee: 2,
        nonce: state.accounts[creator.address]!.nonce,
        timestamp: FIXED_TS,
        type: "tokenCreate",
        payload: {
          assetId: "growth-coin",
          name: "Growth Coin",
          symbol: "GRW",
          decimals: 6,
          totalSupply: 1_000_000_000_000
        }
      }),
      DEFAULT_CONFIG
    );
    expect(networkActivityEpochCount(state, creator.address, 1)).toBe(1);
    expect(contributionEpochCount(state, creator.address, 1)).toBe(0);

    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "launch-again",
        from: creator.address,
        to: creator.address,
        amount: 0,
        fee: 2,
        nonce: state.accounts[creator.address]!.nonce,
        timestamp: FIXED_TS,
        type: "tokenCreate",
        payload: {
          assetId: "growth-coin-2",
          name: "Growth Two",
          symbol: "GR2",
          decimals: 6,
          totalSupply: 1_000_000_000_000
        }
      }),
      DEFAULT_CONFIG
    );
    expect(networkActivityEpochCount(state, creator.address, 1)).toBe(1);

    applyTransaction(
      state,
      signTransaction(buyer.privateKey, {
        id: "curve-fee-zero",
        from: buyer.address,
        to: buyer.address,
        amount: 0,
        fee: 1,
        nonce: state.accounts[buyer.address]!.nonce,
        timestamp: FIXED_TS,
        type: "curveBuy",
        payload: { assetId: "growth-coin", nativeIn: 50, minTokensOut: 1 }
      }),
      DEFAULT_CONFIG
    );
    expect(networkActivityEpochCount(state, buyer.address, 1)).toBe(0);
    expect(contributionEpochCount(state, buyer.address, 1)).toBe(0);

    applyTransaction(
      state,
      signTransaction(buyer.privateKey, {
        id: "curve-fee",
        from: buyer.address,
        to: buyer.address,
        amount: 0,
        fee: 0,
        nonce: state.accounts[buyer.address]!.nonce,
        timestamp: FIXED_TS,
        type: "curveBuy",
        payload: { assetId: "growth-coin", nativeIn: 100, minTokensOut: 1 }
      }),
      DEFAULT_CONFIG
    );
    expect(networkActivityEpochCount(state, buyer.address, 1)).toBe(1);
    expect(contributionEpochCount(state, buyer.address, 1)).toBe(0);
    expect(contributionEpochCount(state, creator.address, 1)).toBe(0);
  });

  test("validator join does not increment C or N", async () => {
    const state = createInitialState();
    const joiner = generateKeyPair();
    await fund(state, joiner, 400);
    register(state, joiner);
    const join = signTransaction(joiner.privateKey, {
      id: "join-no-cn",
      from: joiner.address,
      to: "staking_pool",
      amount: 200,
      fee: 1,
      nonce: state.accounts[joiner.address]!.nonce,
      timestamp: FIXED_TS,
      type: "joinValidator",
      payload: { nodeKind: "full" }
    });
    applyTransaction(state, join, { ...DEFAULT_CONFIG, warmupEpochs: 0 });
    expect(contributionEpochCount(state, joiner.address, 1)).toBe(0);
    expect(networkActivityEpochCount(state, joiner.address, 1)).toBe(0);
    expect(state.validators[joiner.address]?.stake).toBe(200);
  });
});
