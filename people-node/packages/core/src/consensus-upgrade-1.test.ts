import { describe, expect, test } from "vitest";
import type { NetworkConfig, Transaction } from "@ovn/protocol";
import {
  DEFAULT_CONFIG,
  DEFAULT_NFT_MINT_MIN_FEE,
  DEFAULT_TX_GAS_LIMIT,
  GROWTH_EPOCH_LENGTH,
  NATIVE_ASSET_ID,
  applyNftMint,
  applyTransaction,
  buildBlock,
  bytesToHex,
  createInitialState,
  distributeEpochRewards,
  enqueueTransaction,
  ensureAccount,
  generateKeyPair,
  hexToBytes,
  quoteContractFeePpl,
  signTransaction,
  updateFinality,
  wrapRuntimeAsDeploy
} from "./index.js";
import type { ChainState } from "./index.js";
import { pplToAtoms } from "./ppl-units.js";

/**
 * Consensus Upgrade #1 (owner-approved small items), gated behind one activation height.
 * See docs/protocol-decisions/consensus-upgrade-1.md for the per-item rationale.
 */

const upgradeConfig = (height: number): NetworkConfig => ({
  ...DEFAULT_CONFIG,
  consensusUpgrade1: { height }
});

function funded(config: NetworkConfig, key: { address: string; privateKey: string }, balance = 1_000_000): ChainState {
  const state = createInitialState(config);
  const account = ensureAccount(state, key.address);
  account.balance = balance;
  account.balances[NATIVE_ASSET_ID] = balance;
  return state;
}

describe("B10: stake, rewards and slashes are atom-exact behind the upgrade", () => {
  test("a non-atom-exact stake is rejected after the upgrade, accepted before", () => {
    const user = generateKeyPair();
    const upgraded = upgradeConfig(1);
    const upgradedState = funded(upgraded, user);
    const joinTx = (amount: number, nonce: number, id: string) =>
      signTransaction(user.privateKey, {
        chainId: DEFAULT_CONFIG.chainId,
        id,
        from: user.address,
        to: "network",
        amount,
        fee: 0.004875,
        nonce,
        timestamp: 1,
        type: "joinValidator",
        payload: { nodeKind: "full" }
      }, true);

    expect(() => applyTransaction(upgradedState, joinTx(100.0000005, 0, "join-subatom"), upgraded)).toThrow();
    expect(upgradedState.validators[user.address]).toBeUndefined();

    const legacy = { ...DEFAULT_CONFIG, consensusUpgrade1: { height: 50 } };
    const legacyState = funded(legacy, user);
    applyTransaction(legacyState, joinTx(100.0000005, 0, "join-subatom-legacy"), legacy);
    expect(legacyState.validators[user.address]!.stake).toBe(100.0000005);
  });

  test("epoch rewards are floored to atoms after the upgrade, with the float remainder going to the top validator", () => {
    const makeState = (config: NetworkConfig): ChainState => {
      const state = createInitialState(config);
      state.validators["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] = {
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        nodeKind: "full",
        status: "active",
        stake: 2,
        uptimeScore: 1,
        attestationScore: 1,
        lastSeen: 1,
        joinedAtEpoch: 0,
        proposedMisses: 0
      };
      state.validators["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"] = {
        address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        nodeKind: "full",
        status: "active",
        stake: 1,
        uptimeScore: 1,
        attestationScore: 1,
        lastSeen: 1,
        joinedAtEpoch: 0,
        proposedMisses: 0
      };
      return state;
    };

    const legacy = { ...DEFAULT_CONFIG, consensusUpgrade1: { height: 50 } };
    const legacyState = makeState(legacy);
    const legacyReward = distributeEpochRewards(legacyState, legacy, 0);
    const legacyA = legacyReward.rewards["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]!;
    // 50 * 2/3 is not representable in six decimal places: the pre-upgrade balance is not
    // atom-exact, and M04-4 would then refuse to ever transfer it.
    expect(() => pplToAtoms(legacyA)).toThrow();

    const upgraded = upgradeConfig(1);
    const upgradedState = makeState(upgraded);
    const upgradedReward = distributeEpochRewards(upgradedState, upgraded, 0);
    const addresses = Object.keys(upgradedReward.rewards);
    let totalAtoms = 0;
    for (const address of addresses) {
      const amount = upgradedReward.rewards[address]!;
      expect(() => pplToAtoms(amount)).not.toThrow();
      totalAtoms += pplToAtoms(amount);
    }
    expect(totalAtoms).toBe(pplToAtoms(upgradedReward.totalReward));
  });
});

describe("M01-1 / M03-5: canonical lowercase address, public key and signature behind the upgrade", () => {
  function baseTx(user: { address: string; privateKey: string }, to: { address: string }): Transaction {
    return signTransaction(user.privateKey, {
      chainId: DEFAULT_CONFIG.chainId,
      id: "canon-case",
      from: user.address,
      to: to.address,
      amount: 1,
      fee: 0.004875,
      nonce: 0,
      timestamp: 1,
      type: "transfer"
    }, true);
  }

  test("a mixed-case `from` is rejected by enqueueTransaction and applyTransaction after the upgrade", () => {
    const user = generateKeyPair();
    const recipient = generateKeyPair();
    const upgraded = upgradeConfig(1);
    const state = funded(upgraded, user);
    const tx = { ...baseTx(user, recipient), from: user.address.toUpperCase() };

    expect(() => enqueueTransaction(state, tx, false)).toThrow(/lowercase/);
    expect(() => applyTransaction(state, tx, upgraded)).toThrow(/lowercase/);
  });

  test("a mixed-case publicKey/signature is rejected after the upgrade", () => {
    const user = generateKeyPair();
    const recipient = generateKeyPair();
    const upgraded = upgradeConfig(1);
    const state = funded(upgraded, user);
    const signed = baseTx(user, recipient);
    const tx = { ...signed, publicKey: signed.publicKey!.toUpperCase() };

    expect(() => enqueueTransaction(state, tx, false)).toThrow(/lowercase/);
  });

  test("before the upgrade height, mixed case is still accepted", () => {
    const user = generateKeyPair();
    const recipient = generateKeyPair();
    const legacy = { ...DEFAULT_CONFIG, consensusUpgrade1: { height: 50 } };
    const state = createInitialState(legacy);
    // Pre-upgrade, a mixed-case `from` is its own distinct account key (the historical bug);
    // fund that exact key to exercise admission, not the atom-bound lowercase account.
    const upperAddress = user.address.toUpperCase();
    const account = ensureAccount(state, upperAddress);
    account.balance = 1_000_000;
    account.balances[NATIVE_ASSET_ID] = 1_000_000;
    const tx = { ...baseTx(user, recipient), from: upperAddress };

    expect(() => enqueueTransaction(state, tx, false)).not.toThrow();
  });
});

describe("M10-2: finality counts only current active stake behind the upgrade", () => {
  test("a stale vote weight is ignored once the voter's stake has changed", () => {
    const makeState = (config: NetworkConfig): ChainState => {
      const state = createInitialState(config);
      state.validators["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] = {
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        nodeKind: "full",
        status: "active",
        stake: 10,
        uptimeScore: 1,
        attestationScore: 1,
        lastSeen: 1,
        joinedAtEpoch: 0,
        proposedMisses: 0
      };
      state.validators["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"] = {
        address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        nodeKind: "full",
        status: "active",
        stake: 1000,
        uptimeScore: 1,
        attestationScore: 1,
        lastSeen: 1,
        joinedAtEpoch: 0,
        proposedMisses: 0
      };
      // A stale vote cast while the voter held 1000 stake; it now holds only 10.
      state.attestationVotes = {
        1: {
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": { blockHash: "h1", weight: 1000 }
        }
      };
      state.finalizedHeight = 0;
      return state;
    };

    const legacy = { ...DEFAULT_CONFIG, consensusUpgrade1: { height: 50 } };
    const legacyState = makeState(legacy);
    updateFinality(legacyState, legacy);
    expect(legacyState.finalizedHeight).toBe(1);

    const upgraded = upgradeConfig(1);
    const upgradedState = makeState(upgraded);
    updateFinality(upgradedState, upgraded);
    expect(upgradedState.finalizedHeight).toBe(0);
  });
});

describe("M10-4: a slashed validator may leave once jail ends, even below minStake", () => {
  function leaveTx(user: { address: string; privateKey: string }, nonce: number): Transaction {
    return signTransaction(user.privateKey, {
      chainId: DEFAULT_CONFIG.chainId,
      id: "leave-after-slash",
      from: user.address,
      to: "network",
      amount: 0,
      fee: 0,
      nonce,
      timestamp: 1,
      type: "leaveValidator"
    }, true);
  }

  function slashedBelowMin(config: NetworkConfig, user: { address: string; privateKey: string }): ChainState {
    const state = funded(config, user);
    state.validators[user.address] = {
      address: user.address,
      nodeKind: "full",
      status: "slashed",
      stake: config.minStake / 10,
      uptimeScore: 1,
      attestationScore: 1,
      lastSeen: 1,
      joinedAtEpoch: 0,
      proposedMisses: 0,
      jailUntilEpoch: 1
    };
    state.epoch = 2;
    return state;
  }

  test("before the upgrade, leaving stays blocked", () => {
    const user = generateKeyPair();
    const legacy = { ...DEFAULT_CONFIG, consensusUpgrade1: { height: 50 } };
    const state = slashedBelowMin(legacy, user);
    expect(() => applyTransaction(state, leaveTx(user, 0), legacy)).toThrow(/Not an active validator/);
  });

  test("after the upgrade, a slashed validator whose jail ended may leave", () => {
    const user = generateKeyPair();
    const upgraded = upgradeConfig(1);
    const state = slashedBelowMin(upgraded, user);
    applyTransaction(state, leaveTx(user, 0), upgraded);
    expect(state.validators[user.address]!.status).toBe("unbonding");
    expect(state.validators[user.address]!.jailUntilEpoch).toBeUndefined();
  });

  test("a validator still jailed may not leave even after the upgrade", () => {
    const user = generateKeyPair();
    const upgraded = upgradeConfig(1);
    const state = slashedBelowMin(upgraded, user);
    state.validators[user.address]!.jailUntilEpoch = 99;
    expect(() => applyTransaction(state, leaveTx(user, 0), upgraded)).toThrow(/Not an active validator/);
  });
});

describe("M12-3: contract tx fees route through the live Model A split behind the upgrade", () => {
  const RETURN_42 = hexToBytes("0x602a60005260206000f3");

  test("a fractional contract fee is not credited anywhere before the upgrade (legacy gate), and feeds Model A after", async () => {
    const fee = quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT);
    expect(Number.isSafeInteger(fee)).toBe(false);

    const deployTx = (user: { address: string; privateKey: string }, id: string) =>
      signTransaction(user.privateKey, {
        chainId: DEFAULT_CONFIG.chainId,
        id,
        from: user.address,
        to: "0x0000000000000000000000000000000000000000",
        amount: 0,
        fee,
        nonce: 0,
        timestamp: 1,
        type: "contractDeploy",
        payload: { bytecode: bytesToHex(wrapRuntimeAsDeploy(RETURN_42)), gasLimit: DEFAULT_TX_GAS_LIMIT }
      }, true);

    const legacy = { ...DEFAULT_CONFIG, consensusUpgrade1: { height: 50 } };
    const legacyUser = generateKeyPair();
    const legacyState = funded(legacy, legacyUser, 100);
    enqueueTransaction(legacyState, deployTx(legacyUser, "deploy-legacy"));
    await buildBlock(legacyState, "bootstrap-validator", legacy);
    // Legacy gate (`Number.isSafeInteger`) rejects this fractional fee, so it is debited from the
    // sender but never credited to Model A — the historical (buggy) behaviour this upgrade fixes.
    expect(legacyState.pendingValidatorFees ?? 0).toBe(0);
    expect(legacyState.growthPool.totalInflow).toBe(0);

    const upgraded = upgradeConfig(1);
    const upgradedUser = generateKeyPair();
    const upgradedState = funded(upgraded, upgradedUser, 100);
    enqueueTransaction(upgradedState, deployTx(upgradedUser, "deploy-upgraded"));
    await buildBlock(upgradedState, "bootstrap-validator", upgraded);
    expect(upgradedState.pendingValidatorFees ?? 0).toBe(0);
    expect(upgradedState.growthPool.totalInflow).toBeGreaterThan(0);
  });
});

describe("M12-4: contract nonce hydrates from state.contracts behind the upgrade", () => {
  // Child init code: MSTORE8 a single STOP byte at memory 0, then RETURN 1 byte of runtime code.
  const CHILD_INIT = hexToBytes("0x600060005360016000f3");
  // Factory runtime: CODECOPY the 10-byte child init code (embedded at offset 16) into memory,
  // then CREATE a child from it. Called twice, this exercises the factory's own EVM nonce.
  const FACTORY_RUNTIME = hexToBytes(
    "0x" +
      "600a" + // PUSH1 0x0a (size)
      "6010" + // PUSH1 0x10 (code offset: start of CHILD_INIT below)
      "6000" + // PUSH1 0x00 (dest offset)
      "39" + // CODECOPY
      "600a" + // PUSH1 0x0a (size)
      "6000" + // PUSH1 0x00 (offset)
      "6000" + // PUSH1 0x00 (value)
      "f0" + // CREATE
      "50" + // POP
      "00" + // STOP
      "600060005360016000f3" // CHILD_INIT (10 bytes), starts at offset 16 (0x10)
  );

  async function deployAndCallTwice(config: NetworkConfig): Promise<ChainState> {
    const user = generateKeyPair();
    const state = funded(config, user, 1000);
    const factoryAddress = "0x00000000000000000000000000000000f00001";
    const fee = quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT);
    const deployTx = signTransaction(user.privateKey, {
      chainId: DEFAULT_CONFIG.chainId,
      id: "factory-deploy",
      from: user.address,
      to: "0x0000000000000000000000000000000000000000",
      amount: 0,
      fee,
      nonce: 0,
      timestamp: 1,
      type: "contractDeploy",
      payload: { bytecode: bytesToHex(wrapRuntimeAsDeploy(FACTORY_RUNTIME)), gasLimit: DEFAULT_TX_GAS_LIMIT }
    }, true);
    enqueueTransaction(state, deployTx);
    await buildBlock(state, "bootstrap-validator", config);
    const deployedAddress = Object.keys(state.contracts ?? {}).find((addr) => addr !== factoryAddress);
    expect(deployedAddress).toBeDefined();

    for (const [nonce, id] of [[1, "factory-call-1"], [2, "factory-call-2"]] as const) {
      const callTx = signTransaction(user.privateKey, {
        chainId: DEFAULT_CONFIG.chainId,
        id,
        from: user.address,
        to: deployedAddress!,
        amount: 0,
        fee,
        nonce,
        timestamp: 1,
        type: "contractCall",
        payload: { data: "0x", gasLimit: DEFAULT_TX_GAS_LIMIT }
      }, true);
      enqueueTransaction(state, callTx);
      await buildBlock(state, "bootstrap-validator", config);
    }
    return state;
  }

  test("before the upgrade, a second CREATE from the same factory collides (nonce always reads 0)", async () => {
    const legacy = { ...DEFAULT_CONFIG, consensusUpgrade1: { height: 50 } };
    const state = await deployAndCallTwice(legacy);
    // factory + exactly one surviving child (the second CREATE collided with the first).
    expect(Object.keys(state.contracts ?? {}).length).toBe(2);
  });

  test("after the upgrade, each call derives a distinct child address", async () => {
    const upgraded = upgradeConfig(1);
    const state = await deployAndCallTwice(upgraded);
    // factory + two distinct children.
    expect(Object.keys(state.contracts ?? {}).length).toBe(3);
  });
});

describe("M12-7: NFT image URI is restricted to https/ipfs behind the upgrade", () => {
  function mintTx(user: { address: string; privateKey: string }, imageUri: string): Transaction {
    return signTransaction(user.privateKey, {
      chainId: DEFAULT_CONFIG.chainId,
      id: "nft-uri",
      from: user.address,
      to: "nft",
      amount: 0,
      fee: DEFAULT_NFT_MINT_MIN_FEE,
      nonce: 0,
      timestamp: 1,
      type: "nftMint",
      payload: { name: "Scheme test", imageUri }
    }, true);
  }

  test("http:// is rejected after the upgrade, accepted before", () => {
    const upgraded = upgradeConfig(1);
    const upgradedUser = generateKeyPair();
    const upgradedState = funded(upgraded, upgradedUser, 10);
    expect(() => applyNftMint(upgradedState, mintTx(upgradedUser, "http://example.com/n.png"), upgraded)).toThrow(
      /https or ipfs/
    );

    const legacy = { ...DEFAULT_CONFIG, consensusUpgrade1: { height: 50 } };
    const legacyUser = generateKeyPair();
    const legacyState = funded(legacy, legacyUser, 10);
    applyNftMint(legacyState, mintTx(legacyUser, "http://example.com/n.png"), legacy);
    expect(Object.keys(legacyState.nfts ?? {}).length).toBe(1);
  });

  test("ipfs:// is accepted after the upgrade", () => {
    const upgraded = upgradeConfig(1);
    const user = generateKeyPair();
    const state = funded(upgraded, user, 10);
    applyNftMint(state, mintTx(user, "ipfs://bafybeigsomehash"), upgraded);
    expect(Object.keys(state.nfts ?? {}).length).toBe(1);
  });
});

describe("M13-5 part 3: a growth settlement error must not halt the chain behind the upgrade", () => {
  test("a boundary whose settlement throws is skipped (recorded), not fatal, after the upgrade", async () => {
    const upgraded = upgradeConfig(1);
    const state = createInitialState(upgraded);
    // Jump to one block before the first Growth Epoch boundary, and pre-mark epoch 1 as already
    // settled so `settleGrowthEpoch` throws deterministically when the boundary block is built.
    state.chain[0]!.header.height = GROWTH_EPOCH_LENGTH - 1;
    state.growthSettledEpochs[1] = true;
    const block = await buildBlock(state, "bootstrap-validator", upgraded);
    expect(block.header.height).toBe(GROWTH_EPOCH_LENGTH);
    expect(state.growthSettlementFailures).toEqual([
      { epoch: 1, height: GROWTH_EPOCH_LENGTH, message: "Growth epoch already settled" }
    ]);
  });

  test("before the upgrade, the same failure still halts block production", async () => {
    const legacy = { ...DEFAULT_CONFIG, consensusUpgrade1: { height: 1_000_000 } };
    const state = createInitialState(legacy);
    state.chain[0]!.header.height = GROWTH_EPOCH_LENGTH - 1;
    state.growthSettledEpochs[1] = true;
    await expect(buildBlock(state, "bootstrap-validator", legacy)).rejects.toThrow(/already settled/);
  });
});
