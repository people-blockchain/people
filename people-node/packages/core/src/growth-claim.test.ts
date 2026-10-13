import { describe, expect, test } from "vitest";
import type { Transaction } from "@ovn/protocol";
import {
  DEFAULT_CONFIG,
  GENESIS_FAUCET_BALANCE,
  GROWTH_CLAIM_EXPIRY_EPOCHS,
  NATIVE_ASSET_ID,
  applyTransaction,
  buildBlock,
  computeStateRoot,
  createInitialState,
  enqueueTransaction,
  generateKeyPair,
  growthClaimKey,
  growthReference,
  settleGrowthEpoch,
  signTransaction,
  type ChainState
} from "./index.js";

function addr(n: number): string {
  return `0x${n.toString(16).padStart(40, "0")}`;
}

function creditInflow(state: ChainState, epoch: number, amount: number): void {
  state.growthEpochInflow[epoch] = (state.growthEpochInflow[epoch] ?? 0) + amount;
  state.growthPool.totalInflow += amount;
}

/**
 * M13-2: Growth L1/L2 is payable only between identity-verified participants, so
 * the fixtures for the payout math mark both ends verified. The gate itself is
 * covered by `growth-sybil-gate.test.ts`.
 */
function put(state: ChainState, address: string, parent?: string): void {
  const identityVerified = { method: "telegram", verifiedAtHeight: 1 };
  state.participants[address] = parent
    ? { address, parent, linkedAtHeight: 1, registeredAtHeight: 1, identityVerified }
    : { address, registeredAtHeight: 1, identityVerified };
}

function mark(state: ChainState, address: string, contribution: number, network: number): void {
  state.contributionEpochs[address] = Array.from({ length: contribution }, (_, index) => index + 1);
  state.networkActivityEpochs[address] = Array.from({ length: network }, (_, index) => index + 1);
}

function claimTx(
  from: string,
  nonce: number,
  epoch: number,
  referred: string,
  level: 1 | 2,
  amount: number,
  id = "growth-claim"
): Transaction {
  return {
    id,
    from,
    to: from,
    amount: amount / 1_000_000,
    fee: 0,
    nonce,
    timestamp: 1_700_000_000_000,
    type: "growthClaim",
    payload: { epoch, referred, level }
  };
}

function oneClaim(): { state: ChainState; amount: number; key: string } {
  const state = createInitialState();
  for (let epoch = 1; epoch <= 3; epoch += 1) {
    creditInflow(state, epoch, 1000);
  }
  put(state, addr(1));
  put(state, addr(2), addr(1));
  mark(state, addr(2), 4, 4);
  settleGrowthEpoch(state, 4);
  const key = growthClaimKey(4, addr(1), addr(2), 1);
  const amount = state.growthClaims[key]!.amount;
  return { state, amount, key };
}

describe("growth claim", () => {
  test("a full claim settles escrow into a spendable balance", async () => {
    const { state, amount, key } = oneClaim();
    expect(GROWTH_CLAIM_EXPIRY_EPOCHS).toBe(4);
    expect(state.growthClaims[key]!.status).toBe("claimable");
    const supply = state.assets[NATIVE_ASSET_ID]!.totalSupply;
    const inflow = state.growthPool.totalInflow;
    applyTransaction(state, claimTx(addr(1), 0, 4, addr(2), 1, amount), DEFAULT_CONFIG);
    expect(state.growthClaims[key]!.status).toBe("settled");
    expect(state.accounts[addr(1)]!.balance).toBe(amount / 1_000_000);
    expect(state.accounts[addr(1)]!.balances[NATIVE_ASSET_ID]).toBe(amount / 1_000_000);
    expect(state.accounts[addr(1)]!.balances.vls).toBeUndefined();
    expect(NATIVE_ASSET_ID).toBe("ppl");
    expect(state.assets.vls).toBeUndefined();
    expect(state.assets[NATIVE_ASSET_ID]?.symbol).toBe("PPL");
    expect(state.growthPool.escrow).toBe(0);
    expect(state.growthPool.claimedSettled).toBe(amount);
    expect(state.growthPool.totalReturned).toBe(0);
    expect(state.growthPool.totalInflow).toBe(inflow);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
    expect(supply).toBe(GENESIS_FAUCET_BALANCE);
    expect(state.contributionEpochs[addr(1)]).toBeUndefined();
    expect(state.networkActivityEpochs[addr(1)]).toBeUndefined();

    applyTransaction(
      state,
      {
        id: "spend-claim",
        from: addr(1),
        to: addr(9),
        amount: amount / 1_000_000,
        fee: 0,
        nonce: 1,
        timestamp: 1_700_000_000_000,
        type: "transfer"
      },
      DEFAULT_CONFIG
    );
    expect(state.accounts[addr(1)]!.balance).toBe(0);
    expect(state.accounts[addr(9)]!.balance).toBe(amount / 1_000_000);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
  });

  test("partial, replay, and a second claim leave balances unchanged", async () => {
    const partial = oneClaim();
    expect(() =>
      applyTransaction(partial.state, claimTx(addr(1), 0, 4, addr(2), 1, partial.amount - 1), DEFAULT_CONFIG)
    ).toThrow(/Partial growth claim/);
    expect(partial.state.growthClaims[partial.key]!.status).toBe("claimable");
    expect(partial.state.growthPool.escrow).toBe(partial.amount);
    expect(partial.state.accounts[addr(1)]).toBeUndefined();

    const replay = oneClaim();
    const tx = claimTx(addr(1), 0, 4, addr(2), 1, replay.amount, "same-claim");
    applyTransaction(replay.state, tx, DEFAULT_CONFIG);
    const balance = replay.state.accounts[addr(1)]!.balance;
    const escrow = replay.state.growthPool.escrow;
    const settled = replay.state.growthPool.claimedSettled;
    const nonce = replay.state.accounts[addr(1)]!.nonce;
    expect(() => applyTransaction(replay.state, tx, DEFAULT_CONFIG)).toThrow(/not claimable/);
    expect(replay.state.accounts[addr(1)]!.balance).toBe(balance);
    expect(replay.state.growthPool.escrow).toBe(escrow);
    expect(replay.state.growthPool.claimedSettled).toBe(settled);
    expect(replay.state.accounts[addr(1)]!.nonce).toBe(nonce);

    expect(() =>
      applyTransaction(replay.state, claimTx(addr(1), 1, 4, addr(2), 1, replay.amount, "second-claim"), DEFAULT_CONFIG)
    ).toThrow(/not claimable/);
    expect(replay.state.accounts[addr(1)]!.balance).toBe(balance);
  });

  test("claim levels other than 1 or 2 are rejected and do not mint", async () => {
    const { state, amount, key } = oneClaim();
    const supply = state.assets[NATIVE_ASSET_ID]!.totalSupply;
    const escrow = state.growthPool.escrow;
    for (const level of [3, 4, 5]) {
      expect(() =>
        applyTransaction(
          state,
          {
            id: `level-${level}`,
            from: addr(1),
            to: addr(1),
            amount,
            fee: 0,
            nonce: 0,
            timestamp: 1_700_000_000_000,
            type: "growthClaim",
            payload: { epoch: 4, referred: addr(2), level }
          },
          DEFAULT_CONFIG
        )
      ).toThrow(/Invalid growth claim level/);
    }
    expect(state.growthClaims[key]!.status).toBe("claimable");
    expect(state.growthPool.escrow).toBe(escrow);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
    expect(state.accounts[addr(1)]).toBeUndefined();
  });

  test("a non-referrer cannot claim", async () => {
    const { state, amount, key } = oneClaim();
    expect(() => applyTransaction(state, claimTx(addr(9), 0, 4, addr(2), 1, amount), DEFAULT_CONFIG)).toThrow(
      /referrer mismatch/
    );
    expect(state.growthClaims[key]!.status).toBe("claimable");
    expect(state.growthPool.escrow).toBe(amount);
    expect(state.accounts[addr(9)]).toBeUndefined();
    expect(state.accounts[addr(1)]).toBeUndefined();
  });

  test("an unclaimed allocation returns once at epoch E+4 and does not raise inflow or release the cap", async () => {
    const { state, amount, key } = oneClaim();
    const assigned = state.growthAssigned[4]![addr(1)];
    const inflow = { ...state.growthEpochInflow };
    const referenceBefore = growthReference(state.growthEpochInflow, 4 + GROWTH_CLAIM_EXPIRY_EPOCHS);
    state.contributionEpochs = {};
    state.networkActivityEpochs = {};
    const settled = settleGrowthEpoch(state, 4 + GROWTH_CLAIM_EXPIRY_EPOCHS);
    expect(settled.escrowAdded).toBe(0);
    expect(state.growthClaims[key]!.status).toBe("returned");
    expect(state.growthPool.escrow).toBe(0);
    expect(state.growthPool.totalReturned).toBe(amount);
    expect(state.growthPool.claimedSettled).toBe(0);
    expect(state.growthPool.totalInflow).toBe(3000);
    expect(state.growthEpochInflow[1]).toBe(inflow[1]);
    expect(state.growthEpochInflow[8]).toBe(0);
    expect(growthReference(state.growthEpochInflow, 8)).toBe(referenceBefore);
    expect(state.growthAssigned[4]![addr(1)]).toBe(assigned);
    expect(Object.values(state.growthClaims).filter((claim) => claim.epoch === 8)).toEqual([]);

    const returned = state.growthPool.totalReturned;
    expect(() => settleGrowthEpoch(state, 8)).toThrow(/already settled/);
    expect(state.growthPool.totalReturned).toBe(returned);
    expect(() => applyTransaction(state, claimTx(addr(1), 0, 4, addr(2), 1, amount), DEFAULT_CONFIG)).toThrow(
      /not claimable/
    );
    expect(state.accounts[addr(1)]).toBeUndefined();
    expect(state.growthPool.escrow).toBe(0);
    expect(state.growthPool.totalReturned).toBe(returned);
  });

  test("a claim before expiry is not returned", async () => {
    const { state, amount, key } = oneClaim();
    applyTransaction(state, claimTx(addr(1), 0, 4, addr(2), 1, amount), DEFAULT_CONFIG);
    state.contributionEpochs = {};
    state.networkActivityEpochs = {};
    settleGrowthEpoch(state, 8);
    expect(state.growthClaims[key]!.status).toBe("settled");
    expect(state.growthPool.totalReturned).toBe(0);
    expect(state.growthPool.claimedSettled).toBe(amount);
    expect(state.accounts[addr(1)]!.balance).toBe(amount / 1_000_000);
  });

  test("a block can claim the full allocation", async () => {
    const referrer = generateKeyPair();
    const child = generateKeyPair();
    const state = createInitialState();
    for (let epoch = 1; epoch <= 3; epoch += 1) {
      creditInflow(state, epoch, 1000);
    }
    put(state, referrer.address);
    put(state, child.address, referrer.address);
    mark(state, child.address, 4, 4);
    settleGrowthEpoch(state, 4);
    const key = growthClaimKey(4, referrer.address, child.address, 1);
    const amount = state.growthClaims[key]!.amount;
    const supply = state.assets[NATIVE_ASSET_ID]!.totalSupply;
    enqueueTransaction(
      state,
      signTransaction(referrer.privateKey, claimTx(referrer.address, 0, 4, child.address, 1, amount, "block-claim"))
    );
    const block = await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    expect(block.transactions).toHaveLength(1);
    expect(block.header.stateRoot).toBe(computeStateRoot(state));
    expect(state.growthClaims[key]!.status).toBe("settled");
    expect(state.accounts[referrer.address]!.balance).toBe(amount / 1_000_000);
    expect(state.growthPool.escrow).toBe(0);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
    expect(state.validators).toEqual({});
  });
});
