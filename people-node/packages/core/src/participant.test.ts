import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { Level } from "level";
import type { Block, Transaction } from "@people/protocol";
import {
  ChainStore,
  DEFAULT_CONFIG,
  MAX_PARTICIPANT_REFERRAL_DEPTH,
  applyTransaction,
  buildBlock,
  compactChainStateForCheckpoint,
  DEV_FAUCET_PRIVATE_KEY,
  FAUCET_ADDRESS,
  computeStateRoot,
  inclusionBlockHeight,
  createInitialState,
  derivedParticipantDepth,
  distributeEpochRewards,
  enqueueTransaction,
  fundValidatorJoin,
  generateKeyPair,
  hashJson,
  signTransaction,
  tryApplyRemoteBlock,
  type ChainState
} from "./index.js";
import type { KeyPair } from "./crypto.js";

const FIXED_TS = 1_700_000_000_000;

function signedParticipant(
  key: KeyPair,
  type: "registerParticipant" | "participantReferral",
  nonce: number,
  extra?: {
    parent?: string;
    amount?: number;
    fee?: number;
    id?: string;
    timestamp?: number;
    payload?: Record<string, unknown>;
  }
): Transaction {
  const payload = extra?.payload ?? (extra?.parent ? { parent: extra.parent } : undefined);
  return signTransaction(key.privateKey, {
    id: extra?.id ?? `${type}-${nonce}-${key.address.slice(2, 8)}-${extra?.parent?.slice(2, 8) ?? "root"}`,
    from: key.address,
    to: key.address,
    amount: extra?.amount ?? 0,
    fee: extra?.fee ?? 0,
    nonce,
    timestamp: extra?.timestamp ?? FIXED_TS,
    type,
    ...(payload ? { payload } : {})
  });
}

function register(state: ChainState, key: KeyPair, nonce = state.accounts[key.address]?.nonce ?? 0): void {
  applyTransaction(state, signedParticipant(key, "registerParticipant", nonce), DEFAULT_CONFIG);
}

function link(state: ChainState, child: KeyPair, parent: string, nonce = state.accounts[child.address]?.nonce ?? 0): void {
  applyTransaction(
    state,
    signedParticipant(child, "participantReferral", nonce, { parent }),
    DEFAULT_CONFIG
  );
}

function balancesOf(state: ChainState): Record<string, number> {
  return Object.fromEntries(Object.entries(state.accounts).map(([address, account]) => [address, account.balance]));
}

function sealBlock(state: ChainState, transactions: Transaction[], stateRoot: string): Block {
  const head = state.chain[state.chain.length - 1]!;
  const header = {
    height: head.header.height + 1,
    previousHash: head.hash,
    proposer: "bootstrap-validator",
    timestamp: FIXED_TS,
    stateRoot
  };
  return {
    header,
    transactions,
    hash: hashJson({ header, transactions })
  };
}

describe("participant state and referral graph", () => {
  test("an account is not a participant until registerParticipant", async () => {
    const state = createInitialState();
    const wallet = generateKeyPair();
    const rootBefore = computeStateRoot(state);

    applyTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-not-participant",
        from: FAUCET_ADDRESS,
        to: wallet.address,
        amount: 25,
        fee: 0,
        nonce: 0,
        timestamp: FIXED_TS,
        type: "transfer"
      }),
      DEFAULT_CONFIG
    );

    expect(state.accounts[wallet.address]?.balance).toBe(25);
    expect(state.participants[wallet.address]).toBeUndefined();
    expect(state.validators[wallet.address]).toBeUndefined();
    expect(computeStateRoot(state)).not.toBe(rootBefore);

    const fundedRoot = computeStateRoot(state);
    register(state, wallet);
    expect(state.participants[wallet.address]).toEqual({ address: wallet.address, registeredAtHeight: 1 });
    expect(state.participants[wallet.address]?.parent).toBeUndefined();
    expect(state.validators[wallet.address]).toBeUndefined();
    expect(state.accounts[wallet.address]?.balance).toBe(25);
    expect(computeStateRoot(state)).not.toBe(fundedRoot);
  });

  test("duplicate registration is rejected and does not change state", async () => {
    const state = createInitialState();
    const wallet = generateKeyPair();
    register(state, wallet);
    const root = computeStateRoot(state);
    const nonce = state.accounts[wallet.address]!.nonce;
    const participants = structuredClone(state.participants);

    expect(() => register(state, wallet, nonce)).toThrow(/Participant already registered/);
    expect(state.participants).toEqual(participants);
    expect(state.accounts[wallet.address]!.nonce).toBe(nonce);
    expect(computeStateRoot(state)).toBe(root);
  });

  test("non-zero amount or fee is rejected and moves no value", async () => {
    const state = createInitialState();
    const wallet = generateKeyPair();
    const beforeBalances = balancesOf(state);
    const beforeRoot = computeStateRoot(state);

    expect(() =>
      applyTransaction(
        state,
        signedParticipant(wallet, "registerParticipant", 0, { amount: 1 }),
        DEFAULT_CONFIG
      )
    ).toThrow(/must not move value/);
    expect(() =>
      enqueueTransaction(state, signedParticipant(wallet, "registerParticipant", 0, { fee: 1 }))
    ).toThrow(/must not move value/);

    expect(state.participants[wallet.address]).toBeUndefined();
    expect(state.accounts[wallet.address]).toBeUndefined();
    expect(balancesOf(state)).toEqual(beforeBalances);
    expect(computeStateRoot(state)).toBe(beforeRoot);
    expect(state.mempool).toHaveLength(0);
  });

  test("register payload cannot smuggle a parent", async () => {
    const state = createInitialState();
    const parent = generateKeyPair();
    const child = generateKeyPair();
    register(state, parent);
    applyTransaction(
      state,
      signedParticipant(child, "registerParticipant", 0, {
        payload: { parent: parent.address, referrer: parent.address }
      }),
      DEFAULT_CONFIG
    );
    expect(state.participants[child.address]).toEqual({ address: child.address, registeredAtHeight: 1 });
    expect(state.validators[child.address]).toBeUndefined();
  });

  test("stores linkedAtHeight from the including block and does not accept a caller height", async () => {
    const state = createInitialState();
    const parent = generateKeyPair();
    const child = generateKeyPair();
    const other = generateKeyPair();
    enqueueTransaction(state, signedParticipant(parent, "registerParticipant", 0, { id: "reg-parent" }));
    enqueueTransaction(state, signedParticipant(child, "registerParticipant", 0, { id: "reg-child" }));
    enqueueTransaction(state, signedParticipant(other, "registerParticipant", 0, { id: "reg-other" }));
    const registered = await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    expect(registered.header.height).toBe(1);
    expect(state.participants[child.address]?.linkedAtHeight).toBeUndefined();

    enqueueTransaction(
      state,
      signedParticipant(child, "participantReferral", 1, {
        id: "edge",
        payload: { parent: parent.address, linkedAtHeight: 999, linkEpoch: 7 }
      })
    );
    const included = await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    expect(included.header.height).toBe(2);
    expect(included.transactions.some((tx) => tx.id === "edge")).toBe(true);
    expect(state.participants[child.address]).toEqual({
      address: child.address,
      parent: parent.address,
      linkedAtHeight: 2,
      registeredAtHeight: 1
    });
    expect(state.participants[child.address]?.linkedAtHeight).toBe(included.header.height);
    expect(state.participants[parent.address]?.linkedAtHeight).toBeUndefined();

    const root = computeStateRoot(state);
    const nonce = state.accounts[child.address]!.nonce;
    expect(() => link(state, child, other.address, nonce)).toThrow(/already has a parent/);
    expect(state.participants[child.address]?.linkedAtHeight).toBe(2);
    expect(state.participants[child.address]?.parent).toBe(parent.address);
    expect(computeStateRoot(state)).toBe(root);

    const early = createInitialState();
    const late = createInitialState();
    register(early, parent);
    register(early, child);
    link(early, child, parent.address);
    register(late, parent);
    register(late, child);
    await buildBlock(late, "bootstrap-validator", DEFAULT_CONFIG);
    link(late, child, parent.address);
    expect(early.participants[child.address]?.linkedAtHeight).toBe(1);
    expect(late.participants[child.address]?.linkedAtHeight).toBe(2);
    expect(early.participants[child.address]?.parent).toBe(parent.address);
    expect(late.participants[child.address]?.parent).toBe(parent.address);
    expect(computeStateRoot(early)).not.toBe(computeStateRoot(late));
  });

  test("accepts one parent and rejects a second parent without changing the first", async () => {
    const state = createInitialState();
    const root = generateKeyPair();
    const other = generateKeyPair();
    const child = generateKeyPair();
    register(state, root);
    register(state, other);
    register(state, child);
    link(state, child, root.address);

    expect(state.participants[child.address]?.parent).toBe(root.address);
    expect(derivedParticipantDepth(state.participants, child.address)).toBe(1);
    const rootHash = computeStateRoot(state);
    const nonce = state.accounts[child.address]!.nonce;

    expect(() => link(state, child, other.address, nonce)).toThrow(/already has a parent/);
    expect(() => link(state, child, root.address, nonce)).toThrow(/already has a parent/);
    expect(state.participants[child.address]?.parent).toBe(root.address);
    expect(state.accounts[child.address]!.nonce).toBe(nonce);
    expect(computeStateRoot(state)).toBe(rootHash);
  });

  test("rejects self-referral and direct and indirect cycles", async () => {
    const state = createInitialState();
    const root = generateKeyPair();
    const a = generateKeyPair();
    const b = generateKeyPair();
    const c = generateKeyPair();
    for (const key of [root, a, b, c]) {
      register(state, key);
    }

    expect(() => link(state, a, a.address)).toThrow(/Self-referral is not allowed/);
    expect(state.participants[a.address]?.parent).toBeUndefined();

    link(state, b, a.address);
    const afterDirect = computeStateRoot(state);
    expect(() => link(state, a, b.address)).toThrow(/Participant referral cycle/);
    expect(state.participants[a.address]?.parent).toBeUndefined();
    expect(state.participants[b.address]?.parent).toBe(a.address);
    expect(computeStateRoot(state)).toBe(afterDirect);

    link(state, c, b.address);
    const afterChain = computeStateRoot(state);
    expect(() => link(state, a, c.address)).toThrow(/Participant referral cycle/);
    expect(state.participants[a.address]?.parent).toBeUndefined();
    expect(computeStateRoot(state)).toBe(afterChain);
    expect(derivedParticipantDepth(state.participants, c.address)).toBe(2);
  });

  test("accepts L1 through L2 only and rejects depth greater than 2 without storing it", async () => {
    const state = createInitialState();
    expect(MAX_PARTICIPANT_REFERRAL_DEPTH).toBe(2);
    const keys = Array.from({ length: 4 }, () => generateKeyPair());
    for (const key of keys) {
      register(state, key);
    }
    expect(derivedParticipantDepth(state.participants, keys[0]!.address)).toBe(0);

    for (let level = 1; level <= MAX_PARTICIPANT_REFERRAL_DEPTH; level += 1) {
      link(state, keys[level]!, keys[level - 1]!.address);
      expect(derivedParticipantDepth(state.participants, keys[level]!.address)).toBe(level);
      expect(state.participants[keys[level]!.address]?.parent).toBe(keys[level - 1]!.address);
    }

    const rootBeforeReject = computeStateRoot(state);
    const participantsBefore = structuredClone(state.participants);
    expect(() => link(state, keys[3]!, keys[2]!.address)).toThrow(/depth exceeds 2/);
    expect(state.participants[keys[3]!.address]?.parent).toBeUndefined();
    expect(state.participants).toEqual(participantsBefore);
    expect(computeStateRoot(state)).toBe(rootBeforeReject);
    expect(JSON.stringify(state.participants)).not.toContain('"depth"');
  });

  test("a forest can have many roots and does not mix trees", async () => {
    const state = createInitialState();
    const left = generateKeyPair();
    const right = generateKeyPair();
    const leftChild = generateKeyPair();
    const rightChild = generateKeyPair();
    for (const key of [left, right, leftChild, rightChild]) {
      register(state, key);
    }
    link(state, leftChild, left.address);
    link(state, rightChild, right.address);
    expect(derivedParticipantDepth(state.participants, leftChild.address)).toBe(1);
    expect(derivedParticipantDepth(state.participants, rightChild.address)).toBe(1);
    expect(state.participants[left.address]?.parent).toBeUndefined();
    expect(state.participants[right.address]?.parent).toBeUndefined();
  });

  test("malformed parent is rejected", async () => {
    const state = createInitialState();
    const child = generateKeyPair();
    register(state, child);
    const root = computeStateRoot(state);
    for (const parent of ["https://example.test/qr", "0xABCD", "ref", ""]) {
      expect(() =>
        applyTransaction(
          state,
          signedParticipant(child, "participantReferral", 1, { payload: { parent } }),
          DEFAULT_CONFIG
        )
      ).toThrow(/Malformed participant address/);
    }
    expect(() =>
      applyTransaction(
        state,
        signedParticipant(child, "participantReferral", 1, { payload: { referrer: child.address } }),
        DEFAULT_CONFIG
      )
    ).toThrow(/Malformed participant address/);
    expect(state.participants[child.address]?.parent).toBeUndefined();
    expect(computeStateRoot(state)).toBe(root);
  });

  test("edge requires both addresses to already be participants", async () => {
    const state = createInitialState();
    const parent = generateKeyPair();
    const child = generateKeyPair();
    register(state, parent);
    expect(() => link(state, child, parent.address, 0)).toThrow(/Child is not a participant/);
    expect(state.participants[child.address]).toBeUndefined();

    register(state, child);
    const stranger = generateKeyPair();
    expect(() => link(state, child, stranger.address)).toThrow(/Parent is not a participant/);
    expect(state.participants[child.address]?.parent).toBeUndefined();
  });

  test("conflicting referrals are deterministic for the same apply order", async () => {
    const parentA = generateKeyPair();
    const parentB = generateKeyPair();
    const child = generateKeyPair();

    const run = (first: string, second: string) => {
      const state = createInitialState();
      register(state, parentA);
      register(state, parentB);
      register(state, child);
      link(state, child, first);
      const root = computeStateRoot(state);
      expect(() => link(state, child, second)).toThrow(/already has a parent/);
      expect(state.participants[child.address]?.parent).toBe(first);
      expect(computeStateRoot(state)).toBe(root);
      return root;
    };

    const left = run(parentA.address, parentB.address);
    const leftAgain = run(parentA.address, parentB.address);
    const right = run(parentB.address, parentA.address);
    expect(left).toBe(leftAgain);
    expect(left).not.toBe(right);
  });

  test("same mempool order selects one parent and matches across nodes", async () => {
    const parentA = generateKeyPair();
    const parentB = generateKeyPair();
    const child = generateKeyPair();

    const prepare = async () => {
      const state = createInitialState();
      for (const key of [parentA, parentB, child]) {
        enqueueTransaction(state, signedParticipant(key, "registerParticipant", 0, { id: `reg-${key.address}` }));
      }
      await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
      enqueueTransaction(
        state,
        signedParticipant(child, "participantReferral", 1, {
          parent: parentA.address,
          fee: 0,
          id: "edge-a",
          timestamp: FIXED_TS
        })
      );
      expect(() => enqueueTransaction(
        state,
        signedParticipant(child, "participantReferral", 1, {
          parent: parentB.address,
          id: "edge-b",
          timestamp: FIXED_TS + 1
        })
      )).toThrow("Sender already has a pending transaction");
      await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
      return state;
    };

    const nodeA = await prepare();
    const nodeB = await prepare();
    expect(nodeA.participants[child.address]?.parent).toBe(parentA.address);
    expect(nodeB.participants[child.address]?.parent).toBe(parentA.address);
    expect(computeStateRoot(nodeA)).toBe(computeStateRoot(nodeB));
    expect(nodeA.chain.at(-1)?.transactions.some((tx) => tx.id === "edge-b")).toBe(false);
  });

  test("parent registration and edge in one block succeed when the edge sorts first", async () => {
    const state = createInitialState();
    const parent = generateKeyPair();
    const child = generateKeyPair();
    enqueueTransaction(state, signedParticipant(child, "registerParticipant", 0, { id: "reg-child" }));
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);

    enqueueTransaction(
      state,
      signedParticipant(child, "participantReferral", 1, {
        parent: parent.address,
        id: "a-edge"
      })
    );
    enqueueTransaction(state, signedParticipant(parent, "registerParticipant", 0, { id: "z-parent" }));
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    expect(state.participants[parent.address]).toEqual({ address: parent.address, registeredAtHeight: 2 });
    expect(state.participants[child.address]?.parent).toBe(parent.address);
    expect(derivedParticipantDepth(state.participants, child.address)).toBe(1);
    expect(state.mempool).toHaveLength(0);
  });

  test("stateRoot changes when participant or referral state changes and survives restart", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "participant-restart-"));
    try {
      const store = new ChainStore(`${tmpDir}/chain.db`);
      await store.open();
      const state = createInitialState();
      const genesisRoot = computeStateRoot(state);
      const parent = generateKeyPair();
      const child = generateKeyPair();
      register(state, parent);
      const registeredRoot = computeStateRoot(state);
      expect(registeredRoot).not.toBe(genesisRoot);
      expect(() => link(state, child, parent.address, 0)).toThrow(/Child is not a participant/);
      expect(state.participants[child.address]).toBeUndefined();
      expect(computeStateRoot(state)).toBe(registeredRoot);
      register(state, child);
      link(state, child, parent.address);
      const linkedRoot = computeStateRoot(state);
      expect(linkedRoot).not.toBe(registeredRoot);

      await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
      const blockRoot = state.chain.at(-1)!.header.stateRoot;
      expect(blockRoot).toBe(computeStateRoot(state));

      await store.save({
        chainState: state,
        feePool: 0,
        latestReward: null,
        totalValidatorRewards: 0,
        totalTransactions: 1,
        rewardHistory: []
      });
      await store.close();

      const reopened = new ChainStore(`${tmpDir}/chain.db`);
      await reopened.open();
      const loaded = await reopened.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.chainState.participants[parent.address]).toEqual({
        address: parent.address,
        registeredAtHeight: 1
      });
      expect(loaded!.chainState.participants[child.address]?.parent).toBe(parent.address);
      expect(loaded!.chainState.participants[child.address]?.linkedAtHeight).toBe(1);
      expect(computeStateRoot(loaded!.chainState)).toBe(linkedRoot);
      expect(loaded!.chainState.chain.at(-1)!.header.stateRoot).toBe(blockRoot);

      const compact = compactChainStateForCheckpoint(loaded!.chainState);
      const roundTrip = JSON.parse(JSON.stringify(compact)) as ChainState;
      expect(roundTrip.participants).toEqual(loaded!.chainState.participants);
      expect(computeStateRoot(roundTrip)).toBe(linkedRoot);
      await reopened.close();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("a legacy snapshot without participants reloads as an empty map", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "participant-legacy-"));
    try {
      const store = new ChainStore(`${tmpDir}/chain.db`);
      await store.open();
      await store.save({
        chainState: createInitialState(),
        feePool: 0,
        latestReward: null,
        totalValidatorRewards: 0,
        totalTransactions: 0,
        rewardHistory: []
      });
      await store.close();

      const db = new Level<string, string>(`${tmpDir}/chain.db`, { valueEncoding: "utf8" });
      await db.open();
      const snapshot = JSON.parse(await db.get("snapshot")) as { chainState: { participants?: unknown } };
      delete snapshot.chainState.participants;
      await db.put("snapshot", JSON.stringify(snapshot));
      await db.close();

      const reopened = new ChainStore(`${tmpDir}/chain.db`);
      await reopened.open();
      const loaded = await reopened.load();
      expect(loaded!.chainState.participants).toEqual({});
      await reopened.close();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("invalid referral inside a block rolls back and does not change stateRoot", async () => {
    const origin = createInitialState();
    const parent = generateKeyPair();
    const child = generateKeyPair();
    const state = structuredClone(origin);
    enqueueTransaction(state, signedParticipant(parent, "registerParticipant", 0, { id: "reg-parent" }));
    enqueueTransaction(state, signedParticipant(child, "registerParticipant", 0, { id: "reg-child" }));
    const good = await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);

    const receiver = structuredClone(origin);
    expect(await tryApplyRemoteBlock(receiver, good, DEFAULT_CONFIG)).toBe(true);
    expect(receiver.participants).toEqual(state.participants);
    expect(computeStateRoot(receiver)).toBe(computeStateRoot(state));

    const attacker = generateKeyPair();
    register(receiver, attacker);
    const before = computeStateRoot(receiver);
    const participants = structuredClone(receiver.participants);
    const bad = sealBlock(
      receiver,
      [signedParticipant(attacker, "participantReferral", 1, { parent: attacker.address })],
      "not-the-real-root"
    );
    expect(await tryApplyRemoteBlock(receiver, bad, DEFAULT_CONFIG)).toBe(false);
    expect(receiver.participants).toEqual(participants);
    expect(computeStateRoot(receiver)).toBe(before);
  });

  test("a block that fails after registration rolls participant state back", async () => {
    const state = createInitialState();
    const wallet = generateKeyPair();
    const registerTx = signedParticipant(wallet, "registerParticipant", 0);
    const badTransfer = signTransaction(wallet.privateKey, {
      id: "bad-transfer",
      from: wallet.address,
      to: wallet.address,
      amount: 0,
      fee: 0,
      nonce: 1,
      timestamp: FIXED_TS,
      type: "transfer"
    });
    const block = sealBlock(state, [registerTx, badTransfer], "irrelevant");
    expect(await tryApplyRemoteBlock(state, block, DEFAULT_CONFIG)).toBe(false);
    expect(state.participants[wallet.address]).toBeUndefined();
    expect(state.accounts[wallet.address]).toBeUndefined();
  });

  test("participant referral does not pay rewards or touch validator referral", async () => {
    const state = createInitialState();
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 0, referralShare: 0.1 };
    const referrer = fundValidatorJoin(state, "full", 200, config);
    applyTransaction(state, referrer.joinTx, config);
    for (let i = 0; i < 3; i += 1) {
      await buildBlock(state, "bootstrap-validator", config);
    }
    const referred = fundValidatorJoin(state, "full", 200, config, referrer.address);
    applyTransaction(state, referred.joinTx, config);
    for (let i = 0; i < 3; i += 1) {
      await buildBlock(state, "bootstrap-validator", config);
    }

    expect(state.validators[referred.address]?.referredBy).toBe(referrer.address);
    expect(state.participants[referrer.address]).toBeUndefined();
    expect(state.participants[referred.address]).toBeUndefined();

    const isolated = structuredClone(state);
    const participantParent = generateKeyPair();
    register(state, participantParent);
    register(state, referrer.key, state.accounts[referrer.address]!.nonce);
    register(state, referred.key, state.accounts[referred.address]!.nonce);
    const balancesBeforeEdge = balancesOf(state);
    link(state, referred.key, participantParent.address);
    expect(balancesOf(state)).toEqual(balancesBeforeEdge);
    expect(state.treasury).toEqual(isolated.treasury);
    expect(state.burned).toEqual(isolated.burned);
    expect(state.communityPool).toEqual(isolated.communityPool);
    expect(state.validators).toEqual(isolated.validators);
    expect(state.validators[referred.address]?.referredBy).toBe(referrer.address);
    expect(state.participants[referred.address]?.parent).toBe(participantParent.address);
    expect(state.epoch).toBe(isolated.epoch);

    const rewardWithGraph = distributeEpochRewards(state, config, 0);
    const rewardWithoutGraph = distributeEpochRewards(isolated, config, 0);
    expect(rewardWithGraph.rewards).toEqual(rewardWithoutGraph.rewards);
    expect(rewardWithGraph.referralPayouts).toEqual(rewardWithoutGraph.referralPayouts);
    expect(rewardWithGraph.referralPayouts?.[referrer.address]).toBeGreaterThan(0);
    expect(rewardWithGraph.referralPayouts?.[participantParent.address] ?? 0).toBe(0);
    expect(state.accounts[participantParent.address]?.balance ?? 0).toBe(0);
    expect(config.referralShare).toBe(0.1);
    expect(DEFAULT_CONFIG.referralShare).toBe(0.05);
  });
});
