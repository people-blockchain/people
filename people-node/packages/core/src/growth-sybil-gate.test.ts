import { describe, expect, test } from "vitest";
import {
  GROWTH_MAX_PAID_INVITEES_PER_REFERRER,
  GROWTH_L1_WEIGHT,
  GROWTH_L2_WEIGHT,
  createInitialState,
  isGrowthIdentityVerified,
  isL1Eligible,
  settleGrowthEpoch,
  type ChainState
} from "./index.js";

/**
 * M13-2 (owner decision): Growth L1/L2 is payable only between identity-verified
 * participants (Telegram or Human Passport, as on the website), and a referrer is
 * paid for at most 50 invitees per epoch.
 *
 * TODO(M13-2): no transaction writes `identityVerified` yet, so on a real chain no
 * participant is verified and L1/L2 payouts stay off. The PoC network of ~150
 * throwaway accounts (`audit/m13-economy.test.mjs`, test 2) therefore takes 0
 * instead of the whole epoch budget.
 */

function addr(n: number): string {
  return `0x${n.toString(16).padStart(40, "0")}`;
}

function creditInflow(state: ChainState, epoch: number, amount: number): void {
  state.growthEpochInflow[epoch] = (state.growthEpochInflow[epoch] ?? 0) + amount;
  state.growthPool.totalInflow += amount;
}

function put(state: ChainState, address: string, parent?: string, verified = true): void {
  const identityVerified = verified ? { method: "telegram", verifiedAtHeight: 1 } : undefined;
  state.participants[address] = {
    address,
    registeredAtHeight: 1,
    ...(parent ? { parent, linkedAtHeight: 1 } : {}),
    ...(identityVerified ? { identityVerified } : {})
  };
}

function mark(state: ChainState, address: string): void {
  state.contributionEpochs[address] = [1, 2, 3, 4];
  state.networkActivityEpochs[address] = [1, 2, 3, 4];
}

function fundedState(): ChainState {
  const state = createInitialState();
  for (let epoch = 1; epoch <= 3; epoch += 1) {
    creditInflow(state, epoch, 1_000_000);
  }
  return state;
}

describe("growth anti-Sybil gate (M13-2)", () => {
  test("approved weights and the invitee cap", () => {
    expect(GROWTH_L1_WEIGHT).toBe(70);
    expect(GROWTH_L2_WEIGHT).toBe(30);
    expect(GROWTH_MAX_PAID_INVITEES_PER_REFERRER).toBe(50);
  });

  test("identity proof is accepted only for the website's two methods", () => {
    const state = createInitialState();
    put(state, addr(1), undefined, false);
    expect(isGrowthIdentityVerified(state, addr(1))).toBe(false);
    for (const method of ["telegram", "human_passport"]) {
      state.participants[addr(1)]!.identityVerified = { method, verifiedAtHeight: 7 };
      expect(isGrowthIdentityVerified(state, addr(1))).toBe(true);
    }
    for (const bad of [
      { method: "e-mail", verifiedAtHeight: 7 },
      { method: "telegram", verifiedAtHeight: 0 },
      { method: "telegram", verifiedAtHeight: 1.5 }
    ]) {
      state.participants[addr(1)]!.identityVerified = bad;
      expect(isGrowthIdentityVerified(state, addr(1))).toBe(false);
    }
  });

  test("a network of unverified accounts gets nothing", () => {
    const state = fundedState();
    // 50 referrers x 2 children, nobody verified — the PoC shape of test 2.
    let next = 100;
    for (let referrer = 0; referrer < 50; referrer += 1) {
      const root = addr(next);
      next += 1;
      put(state, root, undefined, false);
      for (let child = 0; child < 2; child += 1) {
        const kid = addr(next);
        next += 1;
        put(state, kid, root, false);
        mark(state, kid);
      }
    }
    const result = settleGrowthEpoch(state, 4);
    expect(result.budget).toBeGreaterThan(0);
    expect(result.escrowAdded).toBe(0);
    expect(Object.keys(state.growthClaims)).toHaveLength(0);
  });

  test("an unverified referrer is not paid for a verified invitee, and vice versa", () => {
    for (const [referrerVerified, inviteeVerified] of [
      [false, true],
      [true, false]
    ] as const) {
      const state = fundedState();
      put(state, addr(1), undefined, referrerVerified);
      put(state, addr(2), addr(1), inviteeVerified);
      mark(state, addr(2));
      expect(isL1Eligible(state, addr(2), 4).qualified).toBe(inviteeVerified);
      expect(settleGrowthEpoch(state, 4).escrowAdded).toBe(0);
    }
  });

  test("a verified edge is paid as before", () => {
    const state = fundedState();
    put(state, addr(1));
    put(state, addr(2), addr(1));
    mark(state, addr(2));
    expect(isL1Eligible(state, addr(2), 4)).toEqual({ reason: "QUALIFIED", qualified: true });
    const result = settleGrowthEpoch(state, 4);
    expect(result.escrowAdded).toBeGreaterThan(0);
    expect(Object.keys(state.growthClaims)).toHaveLength(1);
  });

  test("a referrer is paid for at most 50 invitees; the rest are not in escrow", () => {
    const build = (children: number) => {
      const state = fundedState();
      put(state, addr(1));
      for (let index = 0; index < children; index += 1) {
        const kid = addr(1000 + index);
        put(state, kid, addr(1));
        mark(state, kid);
      }
      settleGrowthEpoch(state, 4);
      return state;
    };

    const capped = build(GROWTH_MAX_PAID_INVITEES_PER_REFERRER);
    const over = build(GROWTH_MAX_PAID_INVITEES_PER_REFERRER + 30);
    expect(Object.keys(capped.growthClaims)).toHaveLength(GROWTH_MAX_PAID_INVITEES_PER_REFERRER);
    expect(Object.keys(over.growthClaims)).toHaveLength(GROWTH_MAX_PAID_INVITEES_PER_REFERRER);
    // Adding more children does not get the referrer more of the budget.
    expect(over.growthPool.escrow).toBe(capped.growthPool.escrow);
    // The kept invitees are the deterministic first 50 by address.
    const kept = Object.values(over.growthClaims)
      .map((claim) => claim.referred)
      .sort();
    expect(kept).toEqual(
      Array.from({ length: GROWTH_MAX_PAID_INVITEES_PER_REFERRER }, (_, index) => addr(1000 + index)).sort()
    );
  });
});
