import { describe, expect, test } from "vitest";
import {
  DEFAULT_CONFIG,
  buildBlock,
  chooseFork,
  computeReferenceTokenPriceUsd,
  countTotalTransactions,
  createInitialState,
  distributeEpochRewards,
  enqueueTransaction,
  estimateTotalValidatorRewards,
  generateKeyPair,
  signTransaction,
  signBlock,
  hashJson,
  fundValidatorJoin,
  applyTransaction,
  ensureAccount,
  activateValidators,
  syncAccountNonce,
  suggestedTransferFee,
  DEFAULT_TRANSFER_FEE,
  trimChainWindow,
  compactChainStateForCheckpoint,
  CHAIN_WINDOW_BLOCKS,
  validateAndReplayChain,
  verifySlashEvidence,
  DEV_FAUCET_PRIVATE_KEY,
  FAUCET_ADDRESS,
  NATIVE_ASSET_ID,
  NATIVE_ASSET,
  PROVISIONAL_FEE_SPLIT,
  LEGACY_FEE_SPLIT,
  registerAsset,
  getAsset,
  listAssets,
  isValidAssetId,
  getAccountBalance,
  setAccountBalance,
  getAllBalances,
  FeeSplitter,
  createInitialCommunityPoolState,
  allocateToCommunityPool,
  distributeFromCommunityPool,
  getCommunityPoolAccounting,
  computeStateRoot,
  ChainStore,
  BondingCurveEngine,
  calculateVestedAmount,
  getClaimableVestedTokens,
  executeMigration,
  applyTokenCreate,
  applyCurveBuy,
  applyCurveSell,
  applyCreatorClaim
} from "./index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("core blockchain", () => {
  test("builds blocks and activates validator with signatures", async () => {
    const state = createInitialState();
    const validator = generateKeyPair();
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 0 };

    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-1",
        from: FAUCET_ADDRESS,
        to: validator.address,
        amount: 500,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer"
      })
    );

    enqueueTransaction(
      state,
      signTransaction(validator.privateKey, {
        id: "join-1",
        from: validator.address,
        to: "staking_pool",
        amount: 200,
        fee: 1,
        nonce: 0,
        timestamp: Date.now(),
        type: "joinValidator",
        payload: { nodeKind: "full" }
      })
    );

    for (let i = 0; i < 3; i += 1) {
      await buildBlock(state, "bootstrap-validator", config);
    }

    expect(state.validators[validator.address]?.status).toBe("active");
    expect(state.chain.length).toBeGreaterThan(1);
  });

  test("distributes rewards to active validators", async () => {
    const state = createInitialState();
    state.validators.val1 = {
      address: "val1",
      nodeKind: "full",
      status: "active",
      stake: 500,
      uptimeScore: 1,
      attestationScore: 1,
      lastSeen: Date.now(),
      joinedAtEpoch: 0
    };
    state.validators.val2 = {
      address: "val2",
      nodeKind: "light",
      status: "active",
      stake: 500,
      uptimeScore: 1,
      attestationScore: 1,
      lastSeen: Date.now(),
      joinedAtEpoch: 0
    };
    const reward = distributeEpochRewards(state, DEFAULT_CONFIG, 10);
    expect(reward.totalReward).toBe(60);
    expect(Object.keys(reward.rewards).length).toBe(2);
  });

  test("pays nothing when no active validators", async () => {
    const state = createInitialState();
    const reward = distributeEpochRewards(state, DEFAULT_CONFIG, 10);
    expect(reward.totalReward).toBe(0);
    expect(Object.keys(reward.rewards)).toHaveLength(0);
  });

  test("transfer memo is stored in payload and validated", async () => {
    const state = createInitialState();
    const wallet = generateKeyPair();

    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-wallet-memo",
        from: FAUCET_ADDRESS,
        to: wallet.address,
        amount: 100,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);

    enqueueTransaction(
      state,
      signTransaction(wallet.privateKey, {
        id: "send-with-memo",
        from: wallet.address,
        to: FAUCET_ADDRESS,
        amount: 5,
        fee: 0.1,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer",
        payload: { memo: "Payment for validator hosting" }
      })
    );
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);

    const tx = state.chain.at(-1)?.transactions.at(-1);
    expect(tx?.payload?.memo).toBe("Payment for validator hosting");

    expect(() =>
      enqueueTransaction(
        state,
        signTransaction(wallet.privateKey, {
          id: "memo-too-long",
          from: wallet.address,
          to: FAUCET_ADDRESS,
          amount: 1,
          fee: 0.1,
          nonce: 1,
          timestamp: Date.now(),
          type: "transfer",
          payload: { memo: "x".repeat(257) }
        })
      )
    ).toThrow("Memo too long");
  });

  test("counts total transactions across the chain", async () => {
    const state = createInitialState();
    const wallet = generateKeyPair();

    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "tx-1",
        from: FAUCET_ADDRESS,
        to: wallet.address,
        amount: 10,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);

    enqueueTransaction(
      state,
      signTransaction(wallet.privateKey, {
        id: "tx-2",
        from: wallet.address,
        to: FAUCET_ADDRESS,
        amount: 1,
        fee: 0.1,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);

    expect(countTotalTransactions(state)).toBe(2);
  });

  test("increments nonce only for outgoing transactions", async () => {
    const state = createInitialState();
    const wallet = generateKeyPair();

    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-wallet",
        from: FAUCET_ADDRESS,
        to: wallet.address,
        amount: 100,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);

    expect(state.accounts[wallet.address]?.balance).toBe(100);
    expect(syncAccountNonce(state, wallet.address)).toBe(0);

    enqueueTransaction(
      state,
      signTransaction(wallet.privateKey, {
        id: "send-back",
        from: wallet.address,
        to: FAUCET_ADDRESS,
        amount: 10,
        fee: 0.1,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);

    expect(syncAccountNonce(state, wallet.address)).toBe(1);
  });

  test("activates validator after warmup epochs and supports leave/unstake", async () => {
    const state = createInitialState();
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 1, unbondingEpochs: 1 };
    const validator = generateKeyPair();

    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-2",
        from: FAUCET_ADDRESS,
        to: validator.address,
        amount: 500,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    enqueueTransaction(
      state,
      signTransaction(validator.privateKey, {
        id: "join-2",
        from: validator.address,
        to: "staking_pool",
        amount: 200,
        fee: 1,
        nonce: 0,
        timestamp: Date.now(),
        type: "joinValidator",
        payload: { nodeKind: "full" }
      })
    );

    for (let i = 0; i < 9; i += 1) {
      await buildBlock(state, "bootstrap-validator", config);
    }
    expect(state.validators[validator.address]?.status).toBe("joining");
    await buildBlock(state, "bootstrap-validator", config);
    expect(state.epoch).toBe(1);
    expect(state.validators[validator.address]?.status).toBe("active");

    enqueueTransaction(
      state,
      signTransaction(validator.privateKey, {
        id: "leave-2",
        from: validator.address,
        to: "staking_pool",
        amount: 0,
        fee: 0.1,
        nonce: 1,
        timestamp: Date.now(),
        type: "leaveValidator"
      })
    );
    await buildBlock(state, "bootstrap-validator", config);
    expect(state.validators[validator.address]?.status).toBe("unbonding");

    for (let i = 0; i < 10; i += 1) {
      await buildBlock(state, "bootstrap-validator", config);
    }

    enqueueTransaction(
      state,
      signTransaction(validator.privateKey, {
        id: "unstake-2",
        from: validator.address,
        to: "staking_pool",
        amount: 0,
        fee: 0.1,
        nonce: 2,
        timestamp: Date.now(),
        type: "unstake"
      })
    );
    await buildBlock(state, "bootstrap-validator", config);
    expect(state.validators[validator.address]?.status).toBe("inactive");
    expect(state.accounts[validator.address]?.balance ?? 0).toBeGreaterThan(200);
  });
});

describe("e2e validator network", () => {
  test("3 full + 2 light validators earn PPL rewards", async () => {
    const state = createInitialState();
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 0 };
    const validators = [
      fundValidatorJoin(state, "full", 300, config),
      fundValidatorJoin(state, "full", 400, config),
      fundValidatorJoin(state, "full", 500, config),
      fundValidatorJoin(state, "light", 200, config),
      fundValidatorJoin(state, "light", 250, config)
    ];

    for (const v of validators) {
      enqueueTransaction(state, v.joinTx);
    }

    for (let i = 0; i < 12; i += 1) {
      await buildBlock(state, "bootstrap-validator", config);
    }

    const active = Object.values(state.validators).filter((v) => v.status === "active");
    expect(active.length).toBe(5);

    const reward = distributeEpochRewards(state, config, 5);
    expect(reward.totalReward).toBe(55);
    for (const validator of active) {
      expect(reward.rewards[validator.address] ?? 0).toBeGreaterThan(0);
      expect(state.accounts[validator.address]?.balance ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("fork choice and pricing", () => {
  test("chooseFork accepts longer valid remote chain", async () => {
    const state = createInitialState();
    const wallet = generateKeyPair();
    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-fork",
        from: FAUCET_ADDRESS,
        to: wallet.address,
        amount: 100,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);

    const shorter = structuredClone(state);
    shorter.chain = shorter.chain.slice(0, 2);

    const chosen = await chooseFork(shorter, state.chain, DEFAULT_CONFIG);
    expect(chosen?.chain.length).toBe(3);
  });

  test("validateAndReplayChain rejects invalid chain", async () => {
    const state = createInitialState();
    const invalid = [...state.chain, {
      header: {
        height: 1,
        previousHash: "wrong",
        stateRoot: "x",
        proposer: "bootstrap-validator",
        timestamp: Date.now()
      },
      transactions: [],
      hash: "bad"
    }];
    expect(await validateAndReplayChain(invalid, DEFAULT_CONFIG)).toBeNull();
  });

  test("estimateTotalValidatorRewards counts epoch blocks", async () => {
    const state = createInitialState();
    for (let i = 0; i < 10; i += 1) {
      await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    }
    expect(estimateTotalValidatorRewards(state, DEFAULT_CONFIG)).toBe(DEFAULT_CONFIG.epochBaseIssuance);
  });

  test("computeReferenceTokenPriceUsd uses stake and supply", async () => {
    const state = createInitialState();
    const validator = fundValidatorJoin(state, "full", 200, { ...DEFAULT_CONFIG, warmupEpochs: 0 });
    enqueueTransaction(state, validator.joinTx);
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    const price = computeReferenceTokenPriceUsd(state, DEFAULT_CONFIG, 0.12);
    expect(price).toBeGreaterThan(0);
  });

  test("verifySlashEvidence requires two signed conflicting blocks", async () => {
    const state = createInitialState();
    const validator = generateKeyPair();
    const base = await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    const header = { ...base.header, proposer: validator.address };
    const blockA = signBlock({ header, transactions: [], hash: hashJson({header, transactions: []}) }, validator.privateKey);
    const headerB = { ...header, timestamp: header.timestamp + 1 };
    const blockB = signBlock({ header: headerB, transactions: [], hash: hashJson({header:headerB, transactions:[]}) }, validator.privateKey);
    const evidence = { type: "double_sign" as const, validator: validator.address, height: header.height, blockHashA: blockA.hash, blockHashB: blockB.hash, blockA, blockB };
    expect(verifySlashEvidence(state, evidence)).toBe(true);
    expect(verifySlashEvidence(state, {...evidence, blockB: {...blockB, signature: undefined}})).toBe(false);
    expect(verifySlashEvidence(state, {...evidence, blockA: undefined, blockB: undefined})).toBe(false);
  });

  test("attestation requires matching blockHash and finalizes by quorum", async () => {
    const state = createInitialState();
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 0, attestationFinalityThreshold: 0.5 };
    const v1 = fundValidatorJoin(state, "full", 200, config);
    const v2 = fundValidatorJoin(state, "full", 200, config);
    enqueueTransaction(state, v1.joinTx);
    enqueueTransaction(state, v2.joinTx);
    const block = await buildBlock(state, "bootstrap-validator", config);
    activateValidators(state, config);

    enqueueTransaction(
      state,
      signTransaction(v1.key.privateKey, {
        id: "att-1",
        from: v1.address,
        to: "network",
        amount: 0,
        fee: 0,
        nonce: state.accounts[v1.address]!.nonce,
        timestamp: Date.now(),
        type: "attestation",
        payload: { headerHeight: block.header.height, blockHash: block.hash }
      })
    );
    enqueueTransaction(
      state,
      signTransaction(v2.key.privateKey, {
        id: "att-2",
        from: v2.address,
        to: "network",
        amount: 0,
        fee: 0,
        nonce: state.accounts[v2.address]!.nonce,
        timestamp: Date.now(),
        type: "attestation",
        payload: { headerHeight: block.header.height, blockHash: block.hash }
      })
    );
    await buildBlock(state, "bootstrap-validator", config);
    expect(state.finalizedHeight).toBeGreaterThanOrEqual(block.header.height);
  });

  test("conflicting attestation slashes the validator", async () => {
    const state = createInitialState();
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 0 };
    const v1 = fundValidatorJoin(state, "full", 200, config);
    enqueueTransaction(state, v1.joinTx);
    const block = await buildBlock(state, "bootstrap-validator", config);
    activateValidators(state, config);
    const stakeBefore = state.validators[v1.address]!.stake;

    enqueueTransaction(
      state,
      signTransaction(v1.key.privateKey, {
        id: "att-a",
        from: v1.address,
        to: "network",
        amount: 0,
        fee: 0,
        nonce: state.accounts[v1.address]!.nonce,
        timestamp: Date.now(),
        type: "attestation",
        payload: { headerHeight: block.header.height, blockHash: block.hash }
      })
    );
    await buildBlock(state, "bootstrap-validator", config);

    // Plant a fake ballot for another hash, then submit conflicting attestation payload
    // by applying a second vote against a planted twin hash via ballots + apply path.
    const twinHash = `${block.hash}-twin`;
    state.chain.push({
      header: { ...block.header, previousHash: block.hash },
      transactions: [],
      hash: twinHash
    });
    // Force height collision for attestation lookup: use same height as original
    state.chain[state.chain.length - 1]!.header.height = block.header.height;

    enqueueTransaction(
      state,
      signTransaction(v1.key.privateKey, {
        id: "att-b",
        from: v1.address,
        to: "network",
        amount: 0,
        fee: 0,
        nonce: state.accounts[v1.address]!.nonce,
        timestamp: Date.now(),
        type: "attestation",
        payload: { headerHeight: block.header.height, blockHash: twinHash }
      })
    );
    await buildBlock(state, "bootstrap-validator", config);
    expect(state.validators[v1.address]!.status).toBe("slashed");
    expect(state.validators[v1.address]!.stake).toBeLessThan(stakeBefore);
  });

  test("slashEvidence pays reporter share", async () => {
    const state = createInitialState();
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 0 };
    const validator = fundValidatorJoin(state, "full", 400, config);
    const reporter = generateKeyPair();
    enqueueTransaction(state, validator.joinTx);
    await buildBlock(state, "bootstrap-validator", config);
    activateValidators(state, config);

    const header = { ...state.chain[state.chain.length - 1]!.header, proposer: validator.address };
    const blockA = signBlock({ header, transactions: [], hash: hashJson({header, transactions: []}) }, validator.key.privateKey);
    const twinHeader = { ...header, timestamp: header.timestamp + 1 };
    const twin = signBlock({ header: twinHeader, transactions: [], hash: hashJson({header:twinHeader, transactions: []}) }, validator.key.privateKey);

    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-reporter",
        from: FAUCET_ADDRESS,
        to: reporter.address,
        amount: 10,
        fee: 0,
        nonce: state.accounts[FAUCET_ADDRESS]!.nonce,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", config);
    const before = state.accounts[reporter.address]!.balance;
    const stakeBefore = state.validators[validator.address]!.stake;

    enqueueTransaction(
      state,
      signTransaction(reporter.privateKey, {
        id: "slash-1",
        from: reporter.address,
        to: "network",
        amount: 0,
        fee: 0,
        nonce: state.accounts[reporter.address]!.nonce,
        timestamp: Date.now(),
        type: "slashEvidence",
        payload: {
          type: "double_sign",
          validator: validator.address,
          height: blockA.header.height,
          blockHashA: blockA.hash,
          blockHashB: twin.hash,
          blockA,
          blockB: twin,
          reporter: reporter.address
        }
      })
    );
    await buildBlock(state, "bootstrap-validator", config);
    expect(state.validators[validator.address]!.status).toBe("slashed");
    expect(state.accounts[reporter.address]!.balance).toBeGreaterThan(before);
    expect(state.validators[validator.address]!.stake).toBe(stakeBefore * 0.75);
    const after = structuredClone(state);
    const repeated = signTransaction(reporter.privateKey, {
      id: "repeated-evidence", from: reporter.address, to: "network", amount: 0, fee: 0,
      nonce: state.accounts[reporter.address]!.nonce, timestamp: Date.now(), type: "slashEvidence",
      payload: {type:"double_sign",validator:validator.address,height:blockA.header.height,
        blockHashA:twin.hash,blockHashB:blockA.hash,blockA:twin,blockB:blockA}
    });
    expect(() => applyTransaction(state,repeated,config)).toThrow("already applied");
    expect(state).toEqual(after);

  });

  test("applies batch transfer with shared fee", async () => {
    const state = createInitialState();
    const sender = generateKeyPair();
    const a = generateKeyPair();
    const b = generateKeyPair();
    const config = { ...DEFAULT_CONFIG };

    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-batch-sender",
        from: FAUCET_ADDRESS,
        to: sender.address,
        amount: 100,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", config);

    enqueueTransaction(
      state,
      signTransaction(sender.privateKey, {
        id: "batch-1",
        from: sender.address,
        to: "batch",
        amount: 30,
        fee: 0.11,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer",
        payload: {
          recipients: [
            { to: a.address, amount: 10, memo: "Salary" },
            { to: b.address, amount: 20, memo: "Bonus" }
          ]
        }
      })
    );
    await buildBlock(state, "bootstrap-validator", config);

    expect(state.accounts[a.address]?.balance).toBe(10);
    expect(state.accounts[b.address]?.balance).toBe(20);
    expect(state.accounts[sender.address]?.balance).toBeCloseTo(100 - 30 - 0.11, 8);
    const batchTx = state.chain.at(-1)?.transactions[0];
    expect(batchTx?.payload?.recipients).toEqual([
      { to: a.address, amount: 10, memo: "Salary" },
      { to: b.address, amount: 20, memo: "Bonus" }
    ]);
    expect(batchTx?.payload?.memo).toBeUndefined();
  });

  test("rejects top-level memo on batch transfer", async () => {
    const state = createInitialState();
    const sender = generateKeyPair();
    const a = generateKeyPair();
    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-batch-memo-reject",
        from: FAUCET_ADDRESS,
        to: sender.address,
        amount: 50,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", { ...DEFAULT_CONFIG });
    expect(() =>
      enqueueTransaction(
        state,
        signTransaction(sender.privateKey, {
          id: "batch-bad-memo",
          from: sender.address,
          to: "batch",
          amount: 10,
          fee: 0.1,
          nonce: 0,
          timestamp: Date.now(),
          type: "transfer",
          payload: {
            memo: "shared",
            recipients: [{ to: a.address, amount: 10 }]
          }
        })
      )
    ).toThrow(/per recipient/i);
  });

  test("includes higher-fee transfers before lower-fee ones", async () => {
    const state = createInitialState();
    const low = generateKeyPair();
    const high = generateKeyPair();
    const config = { ...DEFAULT_CONFIG };

    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-low",
        from: FAUCET_ADDRESS,
        to: low.address,
        amount: 50,
        fee: 0,
        nonce: state.accounts[FAUCET_ADDRESS]!.nonce,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", config);

    enqueueTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-high",
        from: FAUCET_ADDRESS,
        to: high.address,
        amount: 50,
        fee: 0,
        nonce: state.accounts[FAUCET_ADDRESS]!.nonce,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    await buildBlock(state, "bootstrap-validator", config);

    enqueueTransaction(
      state,
      signTransaction(low.privateKey, {
        id: "tx-low-fee",
        from: low.address,
        to: FAUCET_ADDRESS,
        amount: 1,
        fee: 0.05,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer"
      })
    );
    enqueueTransaction(
      state,
      signTransaction(high.privateKey, {
        id: "tx-high-fee",
        from: high.address,
        to: FAUCET_ADDRESS,
        amount: 1,
        fee: 0.5,
        timestamp: Date.now() + 1,
        nonce: 0,
        type: "transfer"
      })
    );

    const block = await buildBlock(state, "bootstrap-validator", config);
    expect(block.transactions.map((tx) => tx.id)).toEqual(["tx-high-fee", "tx-low-fee"]);
  });

  test("suggestedTransferFee rises with mempool congestion", async () => {
    expect(suggestedTransferFee([])).toBe(DEFAULT_TRANSFER_FEE);
    const crowded = Array.from({ length: 60 }, (_, i) => ({
      id: `m-${i}`,
      from: "a",
      to: "b",
      amount: 1,
      fee: 0.2,
      nonce: i,
      timestamp: i,
      type: "transfer" as const
    }));
    expect(suggestedTransferFee(crowded)).toBeGreaterThanOrEqual(DEFAULT_TRANSFER_FEE * 1.5);
  });

  test("trimChainWindow keeps genesis and recent tips", async () => {
    const state = createInitialState();
    for (let i = 0; i < 30; i += 1) {
      await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    }
    expect(state.chain.length).toBeGreaterThan(20);
    const result = trimChainWindow(state, 10);
    expect(state.chain[0]?.header.height).toBe(0);
    expect(state.chain.length).toBeLessThanOrEqual(11);
    expect(result.prunedBefore).toBeGreaterThan(0);
    expect(state.chain.at(-1)?.header.height).toBeGreaterThanOrEqual(result.prunedBefore);
  });

  test("compactChainStateForCheckpoint stores tip without full history", async () => {
    const state = createInitialState();
    for (let i = 0; i < 15; i += 1) {
      await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    }
    const compact = compactChainStateForCheckpoint(state);
    expect(compact.chain.length).toBeLessThanOrEqual(2);
    expect(compact.chain.at(-1)?.header.height).toBe(state.chain.at(-1)?.header.height);
    expect(compact.mempool).toEqual([]);
    expect(Object.keys(compact.accounts).length).toBeGreaterThan(0);
  });

  test("rejects self-referral on joinValidator", async () => {
    const state = createInitialState();
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 0 };
    const validator = fundValidatorJoin(state, "full", 200, config);
    expect(() =>
      applyTransaction(
        state,
        signTransaction(validator.key.privateKey, {
          id: "join-self-ref",
          from: validator.address,
          to: "staking_pool",
          amount: 200,
          fee: 1,
          nonce: 0,
          timestamp: Date.now(),
          type: "joinValidator",
          payload: { nodeKind: "full", referrer: validator.address }
        }),
        config
      )
    ).toThrow(/Self-referral/);
  });

  test("rejects unknown or inactive referrer on join", async () => {
    const state = createInitialState();
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 0 };
    const validator = fundValidatorJoin(state, "full", 200, config);
    expect(() =>
      applyTransaction(
        state,
        signTransaction(validator.key.privateKey, {
          id: "join-bad-ref",
          from: validator.address,
          to: "staking_pool",
          amount: 200,
          fee: 1,
          nonce: 0,
          timestamp: Date.now(),
          type: "joinValidator",
          payload: { nodeKind: "full", referrer: "0xdead" }
        }),
        config
      )
    ).toThrow(/Referrer must be/);
  });

  test("stores referredBy and pays referralShare from referee reward", async () => {
    const state = createInitialState();
    const config = { ...DEFAULT_CONFIG, warmupEpochs: 0, referralShare: 0.1 };

    const referrer = fundValidatorJoin(state, "full", 200, config);
    applyTransaction(state, referrer.joinTx, config);
    for (let i = 0; i < 3; i += 1) {
      await buildBlock(state, "bootstrap-validator", config);
    }
    expect(state.validators[referrer.address]?.status).toBe("active");

    const referred = fundValidatorJoin(state, "full", 200, config, referrer.address);
    applyTransaction(state, referred.joinTx, config);
    for (let i = 0; i < 3; i += 1) {
      await buildBlock(state, "bootstrap-validator", config);
    }
    expect(state.validators[referred.address]?.status).toBe("active");
    expect(state.validators[referred.address]?.referredBy).toBe(referrer.address);

    const beforeReferrer = state.accounts[referrer.address]?.balance ?? 0;
    const beforeReferred = state.accounts[referred.address]?.balance ?? 0;
    const reward = distributeEpochRewards(state, config, 0);
    const rawEqualShare = reward.totalReward / 2;
    const cut = rawEqualShare * 0.1;
    expect(reward.rewards[referred.address]).toBeCloseTo(rawEqualShare - cut, 8);
    expect(reward.referralPayouts?.[referrer.address]).toBeCloseTo(cut, 8);
    expect(reward.rewards[referrer.address]).toBeCloseTo(rawEqualShare + cut, 8);
    expect((state.accounts[referrer.address]?.balance ?? 0) - beforeReferrer).toBeCloseTo(
      reward.rewards[referrer.address] ?? 0,
      8
    );
    expect((state.accounts[referred.address]?.balance ?? 0) - beforeReferred).toBeCloseTo(
      reward.rewards[referred.address] ?? 0,
      8
    );
    const paid = Object.values(reward.rewards).reduce((sum, v) => sum + v, 0);
    expect(paid).toBeCloseTo(reward.totalReward, 8);
  });

  test("keeps full reward when referrer is inactive", async () => {
    const state = createInitialState();
    state.validators.ref1 = {
      address: "ref1",
      nodeKind: "full",
      status: "inactive",
      stake: 100,
      uptimeScore: 1,
      attestationScore: 1,
      lastSeen: Date.now(),
      joinedAtEpoch: 0
    };
    state.validators.val1 = {
      address: "val1",
      nodeKind: "full",
      status: "active",
      stake: 500,
      uptimeScore: 1,
      attestationScore: 1,
      lastSeen: Date.now(),
      joinedAtEpoch: 0,
      referredBy: "ref1"
    };
    const reward = distributeEpochRewards(state, { ...DEFAULT_CONFIG, referralShare: 0.05 }, 10);
    expect(reward.rewards.val1).toBe(reward.totalReward);
    expect(reward.referralPayouts?.ref1 ?? 0).toBe(0);
  });
});

describe("multi-asset ledger", () => {
  test("native asset balance is initialized and queryable via helper functions", async () => {
    const state = createInitialState();
    const faucet = state.accounts[FAUCET_ADDRESS]!;
    expect(faucet.balance).toBe(1_000_000);
    expect(faucet.balances[NATIVE_ASSET_ID]).toBe(1_000_000);
    expect(getAccountBalance(faucet, NATIVE_ASSET_ID)).toBe(1_000_000);
    expect(getAccountBalance(faucet)).toBe(1_000_000);
    expect(getAllBalances(faucet)[NATIVE_ASSET_ID]).toBe(1_000_000);

    const asset = getAsset(state, NATIVE_ASSET_ID);
    expect(asset).toBeDefined();
    expect(asset?.symbol).toBe("PPL");
    expect(asset?.name).toBe("People");
    expect(asset?.assetId).toBe("ppl");
    expect(asset?.type).toBe("native");
    expect(asset?.decimals).toBe(6);
  });

  test("registers a second fungible asset and queries metadata", async () => {
    const state = createInitialState();
    const creator = generateKeyPair();

    registerAsset(state, {
      assetId: "token-abc",
      type: "fungible",
      name: "ABC Token",
      symbol: "ABC",
      decimals: 6,
      totalSupply: 10_000_000,
      creator: creator.address,
      status: "active",
      creationMetadata: { website: "https://abc.network" }
    });

    const retrieved = getAsset(state, "token-abc");
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("ABC Token");
    expect(retrieved?.symbol).toBe("ABC");
    expect(retrieved?.totalSupply).toBe(10_000_000);
    expect(retrieved?.creationMetadata?.website).toBe("https://abc.network");

    const list = listAssets(state);
    expect(list.length).toBe(2);
    expect(list.map((a) => a.assetId)).toContain("ppl");
    expect(list.map((a) => a.assetId)).not.toContain("vls");
    expect(list.map((a) => a.assetId)).toContain("token-abc");

    // Cannot register duplicate asset ID
    expect(() =>
      registerAsset(state, {
        assetId: "token-abc",
        type: "fungible",
        name: "Duplicate",
        symbol: "DUP",
        decimals: 6,
        totalSupply: 100,
        creator: creator.address,
        status: "active"
      })
    ).toThrow("already registered");
  });

  test("transfers native asset A and second fungible asset B with independent balances", async () => {
    const state = createInitialState();
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    // 1. Fund Alice with native PPL
    applyTransaction(
      state,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fund-alice-native",
        from: FAUCET_ADDRESS,
        to: alice.address,
        amount: 500,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "transfer",
        assetId: NATIVE_ASSET_ID
      }),
      DEFAULT_CONFIG
    );

    expect(getAccountBalance(state.accounts[alice.address]!, NATIVE_ASSET_ID)).toBe(500);

    // 2. Register asset B and credit Alice with 10,000 units of asset B
    registerAsset(state, {
      assetId: "peoples-token",
      type: "fungible",
      name: "Peoples Token",
      symbol: "PPT",
      decimals: 6,
      totalSupply: 1_000_000_000_000,
      creator: FAUCET_ADDRESS,
      status: "active"
    });

    setAccountBalance(state.accounts[alice.address]!, "peoples-token", 10_000);
    expect(getAccountBalance(state.accounts[alice.address]!, "peoples-token")).toBe(10_000);

    // 3. Alice transfers asset B (peoples-token) to Bob, paying fee in native PPL
    const txTransferB = signTransaction(alice.privateKey, {
      id: "alice-to-bob-token-b",
      from: alice.address,
      to: bob.address,
      amount: 2_500,
      fee: 1,
      nonce: 0,
      timestamp: Date.now(),
      type: "transfer",
      assetId: "peoples-token"
    });

    applyTransaction(state, txTransferB, DEFAULT_CONFIG);

    // Check Alice balances: native decreased only by fee; token B decreased by amount
    expect(getAccountBalance(state.accounts[alice.address]!, NATIVE_ASSET_ID)).toBe(499);
    expect(getAccountBalance(state.accounts[alice.address]!, "peoples-token")).toBe(7_500);
    expect(state.accounts[alice.address]!.nonce).toBe(1);

    // Check Bob balances: token B credited; native balance remains 0
    expect(getAccountBalance(state.accounts[bob.address]!, "peoples-token")).toBe(2_500);
    expect(getAccountBalance(state.accounts[bob.address]!, NATIVE_ASSET_ID)).toBe(0);

    // 4. Alice transfers native asset A to Bob
    const txTransferA = signTransaction(alice.privateKey, {
      id: "alice-to-bob-native-a",
      from: alice.address,
      to: bob.address,
      amount: 100,
      fee: 1,
      nonce: 1,
      timestamp: Date.now(),
      type: "transfer",
      assetId: NATIVE_ASSET_ID
    });

    applyTransaction(state, txTransferA, DEFAULT_CONFIG);

    // Alice balances
    expect(getAccountBalance(state.accounts[alice.address]!, NATIVE_ASSET_ID)).toBe(398); // 499 - 100 - 1
    expect(getAccountBalance(state.accounts[alice.address]!, "peoples-token")).toBe(7_500); // untouched

    // Bob balances
    expect(getAccountBalance(state.accounts[bob.address]!, NATIVE_ASSET_ID)).toBe(100);
    expect(getAccountBalance(state.accounts[bob.address]!, "peoples-token")).toBe(2_500);
  });

  test("rejects token transfer when token balance is insufficient", async () => {
    const state = createInitialState();
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    registerAsset(state, {
      assetId: "test-token",
      type: "fungible",
      name: "Test",
      symbol: "TST",
      decimals: 0,
      totalSupply: 100,
      creator: FAUCET_ADDRESS,
      status: "active"
    });

    // Alice has native PPL for fee but only 50 test-tokens
    ensureAccount(state, alice.address).balance = 10;
    ensureAccount(state, alice.address).balances[NATIVE_ASSET_ID] = 10;
    setAccountBalance(state.accounts[alice.address]!, "test-token", 50);

    const tx = signTransaction(alice.privateKey, {
      id: "fail-insufficient-token",
      from: alice.address,
      to: bob.address,
      amount: 60, // exceeds 50
      fee: 1,
      nonce: 0,
      timestamp: Date.now(),
      type: "transfer",
      assetId: "test-token"
    });

    expect(() => applyTransaction(state, tx, DEFAULT_CONFIG)).toThrow("Insufficient balance for asset: test-token");
  });

  test("rejects token transfer when native balance cannot pay fee", async () => {
    const state = createInitialState();
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    registerAsset(state, {
      assetId: "test-token",
      type: "fungible",
      name: "Test",
      symbol: "TST",
      decimals: 0,
      totalSupply: 100,
      creator: FAUCET_ADDRESS,
      status: "active"
    });

    // Alice has tokens but 0 native PPL
    setAccountBalance(ensureAccount(state, alice.address), "test-token", 100);

    const tx = signTransaction(alice.privateKey, {
      id: "fail-fee",
      from: alice.address,
      to: bob.address,
      amount: 10,
      fee: 1, // Alice has 0 native balance
      nonce: 0,
      timestamp: Date.now(),
      type: "transfer",
      assetId: "test-token"
    });

    expect(() => applyTransaction(state, tx, DEFAULT_CONFIG)).toThrow("Insufficient native balance for fee");
  });

  test("rejects invalid asset ID, unknown asset ID, zero, negative, and non-integer amounts", async () => {
    const state = createInitialState();
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    ensureAccount(state, alice.address).balance = 100;
    ensureAccount(state, alice.address).balances[NATIVE_ASSET_ID] = 100;

    // Invalid asset ID format
    expect(() =>
      applyTransaction(
        state,
        signTransaction(alice.privateKey, {
          id: "tx-bad-id",
          from: alice.address,
          to: bob.address,
          amount: 10,
          fee: 1,
          nonce: 0,
          timestamp: Date.now(),
          type: "transfer",
          assetId: "BAD_ASSET!"
        }),
        DEFAULT_CONFIG
      )
    ).toThrow("Invalid asset ID");

    // Unknown asset ID
    expect(() =>
      applyTransaction(
        state,
        signTransaction(alice.privateKey, {
          id: "tx-unknown-id",
          from: alice.address,
          to: bob.address,
          amount: 10,
          fee: 1,
          nonce: 0,
          timestamp: Date.now(),
          type: "transfer",
          assetId: "nonexistent-token"
        }),
        DEFAULT_CONFIG
      )
    ).toThrow("Asset not found");

    // Zero amount
    expect(() =>
      applyTransaction(
        state,
        signTransaction(alice.privateKey, {
          id: "tx-zero",
          from: alice.address,
          to: bob.address,
          amount: 0,
          fee: 1,
          nonce: 0,
          timestamp: Date.now(),
          type: "transfer",
          assetId: NATIVE_ASSET_ID
        }),
        DEFAULT_CONFIG
      )
    ).toThrow(/Invalid (transfer amount|transaction values)/);

    // Negative amount
    expect(() =>
      applyTransaction(
        state,
        signTransaction(alice.privateKey, {
          id: "tx-neg",
          from: alice.address,
          to: bob.address,
          amount: -5,
          fee: 1,
          nonce: 0,
          timestamp: Date.now(),
          type: "transfer",
          assetId: NATIVE_ASSET_ID
        }),
        DEFAULT_CONFIG
      )
    ).toThrow(/Invalid (transfer amount|transaction values)/);

    // Non-integer token amount
    registerAsset(state, {
      assetId: "fractional-test",
      type: "fungible",
      name: "Frac",
      symbol: "FRC",
      decimals: 6,
      totalSupply: 100,
      creator: FAUCET_ADDRESS,
      status: "active"
    });
    setAccountBalance(state.accounts[alice.address]!, "fractional-test", 100);

    expect(() =>
      applyTransaction(
        state,
        signTransaction(alice.privateKey, {
          id: "tx-float",
          from: alice.address,
          to: bob.address,
          amount: 1.25,
          fee: 1,
          nonce: 0,
          timestamp: Date.now(),
          type: "transfer",
          assetId: "fractional-test"
        }),
        DEFAULT_CONFIG
      )
    ).toThrow("integer base unit");
  });

  test("rejects replay of token transfers via strict nonce check", async () => {
    const state = createInitialState();
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    registerAsset(state, {
      assetId: "token-nonce",
      type: "fungible",
      name: "Nonce Test",
      symbol: "NT",
      decimals: 0,
      totalSupply: 500,
      creator: FAUCET_ADDRESS,
      status: "active"
    });

    ensureAccount(state, alice.address).balance = 50;
    ensureAccount(state, alice.address).balances[NATIVE_ASSET_ID] = 50;
    setAccountBalance(state.accounts[alice.address]!, "token-nonce", 200);

    const tx = signTransaction(alice.privateKey, {
      id: "nonce-replay-tx",
      from: alice.address,
      to: bob.address,
      amount: 50,
      fee: 1,
      nonce: 0,
      timestamp: Date.now(),
      type: "transfer",
      assetId: "token-nonce"
    });

    applyTransaction(state, tx, DEFAULT_CONFIG);
    expect(state.accounts[alice.address]!.nonce).toBe(1);

    // Replay with same nonce must fail
    expect(() => applyTransaction(state, tx, DEFAULT_CONFIG)).toThrow("Invalid nonce");
  });
});

describe("fee splitter", () => {
  test("validates configuration correctly", async () => {
    // 100% allocation
    expect(() => FeeSplitter.validateConfig(LEGACY_FEE_SPLIT)).not.toThrow();

    // Provisional 40/25/20/10/5 allocation
    expect(() => FeeSplitter.validateConfig(PROVISIONAL_FEE_SPLIT)).not.toThrow();

    // Sum != 100
    expect(() =>
      FeeSplitter.validateConfig({
        validatorShare: 50,
        communityShare: 25,
        treasuryShare: 20,
        liquidityShare: 10,
        burnShare: 5 // sum is 110
      })
    ).toThrow("Fee shares must sum to 100");

    // Negative share
    expect(() =>
      FeeSplitter.validateConfig({
        validatorShare: 110,
        communityShare: -10,
        treasuryShare: 0,
        liquidityShare: 0,
        burnShare: 0
      })
    ).toThrow("non-negative");

    // Fractional share
    expect(() =>
      FeeSplitter.validateConfig({
        validatorShare: 33.3,
        communityShare: 33.3,
        treasuryShare: 33.4,
        liquidityShare: 0,
        burnShare: 0
      })
    ).toThrow("safe integers");
  });

  test("calculates deterministic integer splits with exact conservation", async () => {
    // Exact 100 units
    const split100 = FeeSplitter.split(100, PROVISIONAL_FEE_SPLIT);
    expect(split100.validatorAmount).toBe(40);
    expect(split100.communityAmount).toBe(25);
    expect(split100.treasuryAmount).toBe(20);
    expect(split100.liquidityAmount).toBe(10);
    expect(split100.burnAmount).toBe(5);
    expect(
      split100.validatorAmount +
        split100.communityAmount +
        split100.treasuryAmount +
        split100.liquidityAmount +
        split100.burnAmount
    ).toBe(100);

    // Odd fee: 7 base units (floor shares: c=1, t=1, l=0, b=0, validator gets remainder: 7 - 2 = 5)
    const split7 = FeeSplitter.split(7, PROVISIONAL_FEE_SPLIT);
    expect(split7.communityAmount).toBe(1);
    expect(split7.treasuryAmount).toBe(1);
    expect(split7.liquidityAmount).toBe(0);
    expect(split7.burnAmount).toBe(0);
    expect(split7.validatorAmount).toBe(5);
    expect(
      split7.validatorAmount +
        split7.communityAmount +
        split7.treasuryAmount +
        split7.liquidityAmount +
        split7.burnAmount
    ).toBe(7);

    // Very small fee: 1 base unit
    const split1 = FeeSplitter.split(1, PROVISIONAL_FEE_SPLIT);
    expect(split1.validatorAmount).toBe(1);
    expect(split1.communityAmount).toBe(0);
    expect(split1.total).toBe(1);

    // Zero fee
    const split0 = FeeSplitter.split(0, PROVISIONAL_FEE_SPLIT);
    expect(split0.validatorAmount).toBe(0);
    expect(split0.total).toBe(0);

    // Large fee: 100,000,000 units
    const splitLarge = FeeSplitter.split(100_000_000, PROVISIONAL_FEE_SPLIT);
    expect(splitLarge.validatorAmount).toBe(40_000_000);
    expect(splitLarge.communityAmount).toBe(25_000_000);
    expect(splitLarge.treasuryAmount).toBe(20_000_000);
    expect(splitLarge.liquidityAmount).toBe(10_000_000);
    expect(splitLarge.burnAmount).toBe(5_000_000);
    expect(
      splitLarge.validatorAmount +
        splitLarge.communityAmount +
        splitLarge.treasuryAmount +
        splitLarge.liquidityAmount +
        splitLarge.burnAmount
    ).toBe(100_000_000);
  });
});

describe("community pool state", () => {
  test("allocates, distributes, and maintains accounting invariants", async () => {
    const poolState = createInitialCommunityPoolState();

    // Allocation
    allocateToCommunityPool(poolState, NATIVE_ASSET_ID, 1_000);
    const nativeAcc = getCommunityPoolAccounting(poolState, NATIVE_ASSET_ID);
    expect(nativeAcc.totalAllocated).toBe(1_000);
    expect(nativeAcc.totalDistributed).toBe(0);
    expect(nativeAcc.remainingBalance).toBe(1_000);

    // Distribution
    distributeFromCommunityPool(poolState, NATIVE_ASSET_ID, 400);
    expect(nativeAcc.totalAllocated).toBe(1_000);
    expect(nativeAcc.totalDistributed).toBe(400);
    expect(nativeAcc.remainingBalance).toBe(600);
    expect(nativeAcc.totalDistributed + nativeAcc.remainingBalance).toBe(nativeAcc.totalAllocated);

    // Distribution exceeding remaining balance throws
    expect(() => distributeFromCommunityPool(poolState, NATIVE_ASSET_ID, 700)).toThrow(
      "Insufficient community pool balance"
    );

    // Multiple assets tracked independently
    allocateToCommunityPool(poolState, "project-x", 50_000);
    const tokenAcc = getCommunityPoolAccounting(poolState, "project-x");
    expect(tokenAcc.totalAllocated).toBe(50_000);
    expect(tokenAcc.remainingBalance).toBe(50_000);

    // Native pool is unaffected
    expect(getCommunityPoolAccounting(poolState, NATIVE_ASSET_ID).remainingBalance).toBe(600);
  });

  test("integrates with epoch rewards when fee split is configured", async () => {
    const state = createInitialState();
    state.validators.val1 = {
      address: "val1",
      nodeKind: "full",
      status: "active",
      stake: 500,
      uptimeScore: 1,
      attestationScore: 1,
      lastSeen: Date.now(),
      joinedAtEpoch: 0
    };

    const config = {
      ...DEFAULT_CONFIG,
      epochBaseIssuance: 50,
      feeSplit: PROVISIONAL_FEE_SPLIT // 40% val, 25% comm, 20% treas, 10% liq, 5% burn
    };

    // 100 fees collected
    const reward = distributeEpochRewards(state, config, 100);

    // Validator gets issuance (50) + 40% of fee (40) = 90
    expect(reward.totalReward).toBe(90);
    expect(reward.protocolIssuance).toBe(50);
    expect(reward.feeReward).toBe(40);
    expect(reward.rewards.val1).toBe(90);

    // Fee breakdown
    expect(reward.feeDistribution?.communityPoolFees).toBe(25);
    expect(reward.feeDistribution?.treasuryFees).toBe(20);
    expect(reward.feeDistribution?.liquidityFees).toBe(10);
    expect(reward.feeDistribution?.burnedFees).toBe(5);

    // Community pool was credited
    const poolAcc = getCommunityPoolAccounting(state.communityPool, NATIVE_ASSET_ID);
    expect(poolAcc.totalAllocated).toBe(25);
    expect(poolAcc.remainingBalance).toBe(25);

    // Treasury and burn state updated
    expect(state.treasury?.[NATIVE_ASSET_ID]).toBe(20);
    expect(state.burned?.[NATIVE_ASSET_ID]).toBe(5);
  });
});

describe("multi-asset persistence and restoration", () => {
  test("persists multi-asset state and restores correctly across store reload", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "peoples-chainstore-test-"));
    const store = new ChainStore(`${tmpDir}/chain.db`);
    await store.open();

    const state = createInitialState();
    const user = generateKeyPair();

    // Register token
    registerAsset(state, {
      assetId: "persist-token",
      type: "fungible",
      name: "Persist Token",
      symbol: "PER",
      decimals: 4,
      totalSupply: 500_000,
      creator: user.address,
      status: "active"
    });

    // Credit user balances
    setAccountBalance(ensureAccount(state, user.address), NATIVE_ASSET_ID, 777);
    setAccountBalance(state.accounts[user.address]!, "persist-token", 88_888);

    // Allocate community pool
    allocateToCommunityPool(state.communityPool, "persist-token", 12_000);

    // Save snapshot
    await store.save({
      chainState: state,
      feePool: 0,
      latestReward: null,
      totalValidatorRewards: 0,
      totalTransactions: 0,
      rewardHistory: []
    });

    await store.close();

    // Reopen in new store instance
    const storeReopened = new ChainStore(`${tmpDir}/chain.db`);
    await storeReopened.open();
    const loaded = await storeReopened.load();
    expect(loaded).not.toBeNull();

    const restoredState = loaded!.chainState;
    expect(restoredState.assets["persist-token"]).toBeDefined();
    expect(restoredState.assets["persist-token"]?.name).toBe("Persist Token");

    const restoredUser = restoredState.accounts[user.address];
    expect(restoredUser).toBeDefined();
    expect(restoredUser?.balance).toBe(777);
    expect(restoredUser?.balances[NATIVE_ASSET_ID]).toBe(777);
    expect(restoredUser?.balances["persist-token"]).toBe(88_888);

    const restoredPool = restoredState.communityPool.pools["persist-token"];
    expect(restoredPool).toBeDefined();
    expect(restoredPool?.totalAllocated).toBe(12_000);
    expect(restoredPool?.remainingBalance).toBe(12_000);

    await storeReopened.close();
    await rm(tmpDir, { recursive: true, force: true });
  });
});

describe("property and invariant checks", () => {
  test("token balance conservation invariant during transfers", async () => {
    const state = createInitialState();
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    registerAsset(state, {
      assetId: "inv-token",
      type: "fungible",
      name: "Invariant Token",
      symbol: "INV",
      decimals: 0,
      totalSupply: 1_000_000_000_000,
      creator: FAUCET_ADDRESS,
      status: "active"
    });

    setAccountBalance(ensureAccount(state, alice.address), NATIVE_ASSET_ID, 100);
    setAccountBalance(state.accounts[alice.address]!, "inv-token", 10_000);
    ensureAccount(state, bob.address);

    const initialTotalToken = (state.accounts[alice.address]!.balances["inv-token"] ?? 0) +
      (state.accounts[bob.address]!.balances["inv-token"] ?? 0);

    const tx = signTransaction(alice.privateKey, {
      id: "inv-tx-1",
      from: alice.address,
      to: bob.address,
      amount: 3_333,
      fee: 2,
      nonce: 0,
      timestamp: Date.now(),
      type: "transfer",
      assetId: "inv-token"
    });

    applyTransaction(state, tx, DEFAULT_CONFIG);

    const postTotalToken = (state.accounts[alice.address]!.balances["inv-token"] ?? 0) +
      (state.accounts[bob.address]!.balances["inv-token"] ?? 0);

    // Total token units must be strictly conserved
    expect(postTotalToken).toBe(initialTotalToken);
    // No negative balances anywhere
    for (const acct of Object.values(state.accounts)) {
      expect(acct.balance).toBeGreaterThanOrEqual(0);
      for (const bal of Object.values(acct.balances)) {
        expect(bal).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("fee split conservation invariant holds across range of fees", async () => {
    for (const fee of [0, 1, 2, 3, 5, 7, 10, 13, 100, 333, 999, 10_000, 1_000_000]) {
      const split = FeeSplitter.split(fee, PROVISIONAL_FEE_SPLIT);
      const sum =
        split.validatorAmount +
        split.communityAmount +
        split.treasuryAmount +
        split.liquidityAmount +
        split.burnAmount;
      expect(sum).toBe(fee);
      expect(split.validatorAmount).toBeGreaterThanOrEqual(0);
      expect(split.communityAmount).toBeGreaterThanOrEqual(0);
      expect(split.treasuryAmount).toBeGreaterThanOrEqual(0);
      expect(split.liquidityAmount).toBeGreaterThanOrEqual(0);
      expect(split.burnAmount).toBeGreaterThanOrEqual(0);
    }
  });

  test("deterministic stateRoot invariant across independent node state transitions", async () => {
    const nodeA = createInitialState();
    const nodeB = createInitialState();

    const user = generateKeyPair();

    registerAsset(nodeA, {
      assetId: "det-coin",
      type: "fungible",
      name: "Deterministic",
      symbol: "DET",
      decimals: 6,
      totalSupply: 1_000,
      creator: user.address,
      status: "active"
    });

    registerAsset(nodeB, {
      assetId: "det-coin",
      type: "fungible",
      name: "Deterministic",
      symbol: "DET",
      decimals: 6,
      totalSupply: 1_000,
      creator: user.address,
      status: "active"
    });

    allocateToCommunityPool(nodeA.communityPool, "det-coin", 100);
    allocateToCommunityPool(nodeB.communityPool, "det-coin", 100);

    const rootA = computeStateRoot(nodeA);
    const rootB = computeStateRoot(nodeB);

    expect(rootA).toBe(rootB);
  });
});
