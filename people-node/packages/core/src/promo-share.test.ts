import { describe, expect, test } from "vitest";
import {
  applyPromoToAllocation,
  applyPromoTransaction,
  applyTransaction,
  awardPromo,
  BondingCurveEngine,
  buildBlock,
  claimPromo,
  computeStateRoot,
  createGenesisBlock,
  createInitialState,
  createPromoPool,
  DEFAULT_CONFIG,
  DEFAULT_TRANSFER_FEE,
  DEV_FAUCET_PRIVATE_KEY,
  enqueueTransaction,
  ensureAccount,
  FAUCET_ADDRESS,
  generateKeyPair,
  getAccountBalance,
  calculateApprovedFeeSplit,
  growthFeeSplitSwitch,
  keyPairFromPrivateKey,
  listEligibleFeeComponents,
  NATIVE_ASSET_ID,
  parsePromoBps,
  PPL_SCALE,
  PROMO_ACCEPTED_BPS,
  PROMO_BPS_HIGH,
  PROMO_BPS_LOW,
  PROMO_BPS_NONE,
  PROMO_MAX_AWARDS_PER_RECIPIENT,
  PROMO_RECIPIENT_CAP_BPS,
  PROMO_UPFRONT_PERCENT,
  PROMO_VESTING_BLOCKS,
  PROMO_WINDOW_BLOCKS,
  promoAmount,
  promoAwardedTo,
  promoClaimableOf,
  promoDeadline,
  promoRecipientCap,
  promoShareActive,
  promoUndistributed,
  promoVestedOf,
  pplToAtoms,
  readPromoShareUpgrade,
  requireValidPromoBps,
  returnUnusedPromo,
  signTransaction,
  tokenCreateMinFee,
  tryApplyRemoteBlock,
  withoutPromoShareUpgrade
} from "./index.js";
import type { ChainState, PromoPoolState } from "./index.js";
import type { Block, NetworkConfig, Transaction } from "@people/protocol";

/**
 * Node-side counterpart of `contracts/src/libs/CurveMath.sol` (`calculateAllocationWithPromo`)
 * and `contracts/src/promo/PromoRewardsVault.sol`. See `docs/TOKEN-ECONOMY.md` §4a.
 */

const SUPPLY = 1_000_000_000_000; // 1,000,000 whole tokens at 6 decimals
const CREATOR = "0x" + "a".repeat(40);
const ALICE = "0x" + "b".repeat(40);
const BOB = "0x" + "c".repeat(40);
const PROTOCOL = "0x" + "d".repeat(40);

function pool(total = promoAmount(SUPPLY, PROMO_BPS_HIGH), startBlock = 100): PromoPoolState {
  return createPromoPool("gold", CREATOR, PROMO_BPS_HIGH, total, startBlock);
}

describe("promo share — accepted values", () => {
  test("constants mirror PeopleConstants.sol", () => {
    expect(PROMO_BPS_NONE).toBe(0);
    expect(PROMO_BPS_LOW).toBe(500);
    expect(PROMO_BPS_HIGH).toBe(1000);
    expect(PROMO_RECIPIENT_CAP_BPS).toBe(1000);
    expect(PROMO_MAX_AWARDS_PER_RECIPIENT).toBe(16);
    expect(PROMO_UPFRONT_PERCENT).toBe(10);
    // 180 days at 3 s/block — the same horizon CreatorVestingState.durationBlocks already uses.
    expect(PROMO_VESTING_BLOCKS).toBe(5_184_000);
    expect(PROMO_WINDOW_BLOCKS).toBe(PROMO_VESTING_BLOCKS);
    expect([...PROMO_ACCEPTED_BPS]).toEqual([0, 500, 1000]);
  });

  test("only 0, 500 and 1000 are accepted — nothing in between", () => {
    for (const ok of [0, 500, 1000]) expect(() => requireValidPromoBps(ok)).not.toThrow();
    for (const bad of [1, 100, 499, 501, 750, 999, 1001, 2000, 10_000, -500, 0.5, NaN, Infinity]) {
      expect(() => requireValidPromoBps(bad)).toThrow(/Invalid promo share/);
    }
  });

  test("parsePromoBps defaults to 0 and rejects non-numeric input", () => {
    expect(parsePromoBps(undefined, true)).toBe(0);
    expect(parsePromoBps({}, true)).toBe(0);
    expect(parsePromoBps({ promoBps: undefined }, true)).toBe(0);
    expect(parsePromoBps({ promoBps: null }, true)).toBe(0);
    expect(parsePromoBps({ promoBps: 500 }, true)).toBe(500);
    expect(parsePromoBps({ promoBps: 1000 }, true)).toBe(1000);
    expect(() => parsePromoBps({ promoBps: "500" }, true)).toThrow(/must be a number/);
    expect(() => parsePromoBps({ promoBps: true }, true)).toThrow(/must be a number/);
    expect(() => parsePromoBps({ promoBps: 750 }, true)).toThrow(/Invalid promo share/);
  });

  test("below the activation height the field is ignored, never rejected", () => {
    // Must match what a pre-upgrade binary does with an unknown payload key, or the two
    // binaries would disagree on a historical block that happens to carry it.
    expect(parsePromoBps({ promoBps: 1000 }, false)).toBe(0);
    expect(parsePromoBps({ promoBps: 777 }, false)).toBe(0);
    expect(parsePromoBps({ promoBps: "nonsense" }, false)).toBe(0);
  });
});

describe("promo share — allocation", () => {
  const base = BondingCurveEngine.calculateTokenAllocation(SUPPLY);

  test("0 bps returns the base allocation byte-for-byte and promo 0", () => {
    const { allocation, promo } = applyPromoToAllocation(base, SUPPLY, PROMO_BPS_NONE);
    expect(promo).toBe(0);
    expect(allocation).toBe(base); // same object, so the hashed key order cannot drift
    expect(JSON.stringify(allocation)).toBe(JSON.stringify(base));
    expect(Object.keys(allocation)).not.toContain("promo");
  });

  test("500 bps takes 5% of supply out of the curve portion only", () => {
    const { allocation, promo } = applyPromoToAllocation(base, SUPPLY, PROMO_BPS_LOW);
    expect(promo).toBe(SUPPLY * 0.05);
    expect(allocation.promo).toBe(promo);
    expect(allocation.bondingCurve).toBe(SUPPLY * 0.55);
    // Every other bucket is untouched — the mandatory 10% Community Pool in particular.
    expect(allocation.communityPool).toBe(base.communityPool);
    expect(allocation.creator).toBe(base.creator);
    expect(allocation.liquidityReserve).toBe(base.liquidityReserve);
    expect(allocation.ecosystemReserve).toBe(base.ecosystemReserve);
  });

  test("1000 bps takes 10% of supply out of the curve portion only", () => {
    const { allocation, promo } = applyPromoToAllocation(base, SUPPLY, PROMO_BPS_HIGH);
    expect(promo).toBe(SUPPLY * 0.1);
    expect(allocation.bondingCurve).toBe(SUPPLY * 0.5);
    expect(allocation.communityPool).toBe(base.communityPool);
    expect(allocation.creator).toBe(base.creator);
    expect(allocation.liquidityReserve).toBe(base.liquidityReserve);
    expect(allocation.ecosystemReserve).toBe(base.ecosystemReserve);
  });

  test("curve + community + creator + liquidity + ecosystem + promo == total supply, always", () => {
    const supplies = [1_000_000_000_000, 1_000_000_000_001, 7_777_777_777_777, 123_456_789];
    for (const supply of supplies) {
      for (const bps of PROMO_ACCEPTED_BPS) {
        const { allocation, promo } = applyPromoToAllocation(
          BondingCurveEngine.calculateTokenAllocation(supply),
          supply,
          bps
        );
        const sum =
          allocation.bondingCurve +
          allocation.communityPool +
          allocation.creator +
          allocation.liquidityReserve +
          allocation.ecosystemReserve +
          promo;
        expect(sum).toBe(supply);
      }
    }
  });

  test("promoAmount matches the Solidity plain-division shortcut", () => {
    for (const supply of [1_000_000_000_000, 1_000_000_000_001, 999_999_999_999, 19, 11]) {
      expect(promoAmount(supply, PROMO_BPS_LOW)).toBe(Math.floor(supply / 20));
      expect(promoAmount(supply, PROMO_BPS_HIGH)).toBe(Math.floor(supply / 10));
      // ...which is what `totalSupply * promoBps / 10_000` would give, without the intermediate.
      expect(promoAmount(supply, PROMO_BPS_LOW)).toBe(Math.floor((supply * 500) / 10_000));
      expect(promoAmount(supply, PROMO_BPS_HIGH)).toBe(Math.floor((supply * 1000) / 10_000));
      expect(promoAmount(supply, PROMO_BPS_NONE)).toBe(0);
    }
  });
});

describe("promo pool — award rules", () => {
  test("a pool is never created for a zero share", () => {
    expect(() => createPromoPool("gold", CREATOR, PROMO_BPS_NONE, 0, 1)).toThrow(/never created/);
    expect(() => createPromoPool("gold", CREATOR, PROMO_BPS_LOW, 0, 1)).toThrow(/positive safe integer/);
  });

  test("only the creator may award, and never to themselves or a protocol address", () => {
    const p = pool();
    expect(() => awardPromo(p, ALICE, BOB, 10, 200, [PROTOCOL])).toThrow(/Only the token creator/);
    expect(() => awardPromo(p, CREATOR, CREATOR, 10, 200, [PROTOCOL])).toThrow(/Invalid promo recipient/);
    expect(() => awardPromo(p, CREATOR, PROTOCOL, 10, 200, [PROTOCOL])).toThrow(/Invalid promo recipient/);
    expect(() => awardPromo(p, CREATOR, ALICE, 10, 200, [PROTOCOL])).not.toThrow();
    expect(p.awarded).toBe(10);
  });

  test("per-recipient cap is 1000 bps of the pool", () => {
    const p = pool();
    const cap = promoRecipientCap(p);
    expect(cap).toBe(Math.floor(p.total / 10));
    awardPromo(p, CREATOR, ALICE, cap, 200);
    expect(promoAwardedTo(p, ALICE)).toBe(cap);
    expect(() => awardPromo(p, CREATOR, ALICE, 1, 200)).toThrow(/per-recipient cap/);
    // A different recipient still has their own cap.
    expect(() => awardPromo(p, CREATOR, BOB, cap, 200)).not.toThrow();
  });

  test("a recipient may receive at most 16 awards", () => {
    const p = pool();
    for (let i = 0; i < PROMO_MAX_AWARDS_PER_RECIPIENT; i += 1) {
      awardPromo(p, CREATOR, ALICE, 1, 200 + i);
    }
    expect(p.awards[ALICE]).toHaveLength(16);
    expect(() => awardPromo(p, CREATOR, ALICE, 1, 300)).toThrow(/at most 16 promo awards/);
  });

  test("the whole pool cannot be over-committed", () => {
    const p = pool(1_000);
    expect(() => awardPromo(p, CREATOR, ALICE, 101, 200)).toThrow(/per-recipient cap/);
    // 10 recipients at the 100-token cap each exactly exhausts the pool.
    for (let i = 0; i < 10; i += 1) {
      awardPromo(p, CREATOR, "0x" + String(i).repeat(40), 100, 200);
    }
    expect(promoUndistributed(p)).toBe(0);
    expect(() => awardPromo(p, CREATOR, ALICE, 1, 200)).toThrow(/undistributed pool/);
  });

  test("a non-positive or fractional award is refused", () => {
    const p = pool();
    for (const bad of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => awardPromo(p, CREATOR, ALICE, bad, 200)).toThrow(/positive safe integer/);
    }
  });

  test("awards are only possible inside the 180-day window", () => {
    const p = pool(1_000, 100);
    expect(promoDeadline(p)).toBe(100 + PROMO_WINDOW_BLOCKS);
    expect(() => awardPromo(p, CREATOR, ALICE, 1, promoDeadline(p) - 1)).not.toThrow();
    expect(() => awardPromo(p, CREATOR, BOB, 1, promoDeadline(p))).toThrow(/window closed/);
    expect(() => awardPromo(p, CREATOR, BOB, 1, promoDeadline(p) + 1)).toThrow(/window closed/);
  });
});

describe("promo pool — vesting and claims", () => {
  test("10% unlocks at award height, the rest is linear over 180 days", () => {
    const p = pool(1_000_000, 100);
    awardPromo(p, CREATOR, ALICE, 100_000, 1_000);
    expect(promoVestedOf(p, ALICE, 1_000)).toBe(10_000); // 10% upfront
    expect(promoVestedOf(p, ALICE, 999)).toBe(10_000); // never less than upfront
    expect(promoVestedOf(p, ALICE, 1_000 + PROMO_VESTING_BLOCKS / 2)).toBe(10_000 + 45_000);
    expect(promoVestedOf(p, ALICE, 1_000 + PROMO_VESTING_BLOCKS - 1)).toBeLessThan(100_000);
    expect(promoVestedOf(p, ALICE, 1_000 + PROMO_VESTING_BLOCKS)).toBe(100_000);
    expect(promoVestedOf(p, ALICE, 1_000 + PROMO_VESTING_BLOCKS * 10)).toBe(100_000);
  });

  test("vesting is monotonic and never exceeds the award", () => {
    const p = pool(1_000_000, 0);
    awardPromo(p, CREATOR, ALICE, 99_999, 10);
    let previous = 0;
    for (let h = 0; h <= PROMO_VESTING_BLOCKS + 10; h += PROMO_VESTING_BLOCKS / 12) {
      const vested = promoVestedOf(p, ALICE, h);
      expect(vested).toBeGreaterThanOrEqual(previous);
      expect(vested).toBeLessThanOrEqual(99_999);
      previous = vested;
    }
    // The award started at height 10, so the loop's last sample is still a few blocks short.
    expect(previous).toBeLessThan(99_999);
    expect(promoVestedOf(p, ALICE, 10 + PROMO_VESTING_BLOCKS)).toBe(99_999);
  });

  test("each award tranche vests on its own clock", () => {
    const half = PROMO_VESTING_BLOCKS / 2;
    const p = pool(1_000_000, 0);
    awardPromo(p, CREATOR, ALICE, 50_000, 0);
    awardPromo(p, CREATOR, ALICE, 50_000, half);
    // At the vesting horizon of the first tranche: first fully vested (50,000), second only
    // halfway (5,000 upfront + half of the remaining 45,000).
    expect(promoVestedOf(p, ALICE, PROMO_VESTING_BLOCKS)).toBe(50_000 + 5_000 + 22_500);
  });

  test("claim pays the vested remainder once and only once", () => {
    const p = pool(1_000_000, 0);
    awardPromo(p, CREATOR, ALICE, 100_000, 0);
    expect(claimPromo(p, ALICE, 0)).toBe(10_000);
    expect(p.claimed).toBe(10_000);
    expect(() => claimPromo(p, ALICE, 0)).toThrow(/No claimable promo tokens/);
    const half = PROMO_VESTING_BLOCKS / 2;
    expect(claimPromo(p, ALICE, half)).toBe(45_000);
    expect(claimPromo(p, ALICE, PROMO_VESTING_BLOCKS)).toBe(45_000);
    expect(p.claimed).toBe(100_000);
    expect(() => claimPromo(p, ALICE, PROMO_VESTING_BLOCKS * 2)).toThrow(/No claimable/);
    expect(promoClaimableOf(p, ALICE, PROMO_VESTING_BLOCKS * 2)).toBe(0);
  });

  test("an address with no award cannot claim", () => {
    const p = pool();
    expect(() => claimPromo(p, BOB, 1_000)).toThrow(/No promo awards/);
  });
});

describe("promo pool — return of the unused remainder", () => {
  test("nothing can be returned while the window is open", () => {
    const p = pool(1_000, 100);
    expect(() => returnUnusedPromo(p, promoDeadline(p) - 1)).toThrow(/window is open/);
    expect(p.closed).toBe(false);
  });

  test("after the window the unawarded remainder leaves the pool, once", () => {
    const p = pool(1_000, 100);
    awardPromo(p, CREATOR, ALICE, 100, 200);
    expect(returnUnusedPromo(p, promoDeadline(p))).toBe(900);
    expect(p.closed).toBe(true);
    expect(promoUndistributed(p)).toBe(0);
    expect(() => returnUnusedPromo(p, promoDeadline(p) + 1)).toThrow(/already returned/);
  });

  test("already-awarded tokens stay claimable after the remainder is returned", () => {
    const p = pool(1_000_000, 0);
    awardPromo(p, CREATOR, ALICE, 100_000, 0);
    returnUnusedPromo(p, promoDeadline(p));
    expect(claimPromo(p, ALICE, promoDeadline(p))).toBe(100_000);
  });

  test("a closed pool accepts no further awards", () => {
    const p = pool(1_000, 0);
    returnUnusedPromo(p, promoDeadline(p));
    expect(() => awardPromo(p, CREATOR, ALICE, 1, promoDeadline(p))).toThrow(/already returned/);
  });
});

describe("promo share — coordinated activation height", () => {
  test("an unset or empty env value means the feature never activates", () => {
    expect(readPromoShareUpgrade({})).toBeUndefined();
    expect(readPromoShareUpgrade({ PROMO_SHARE_UPGRADE_HEIGHT: "" })).toBeUndefined();
    expect(readPromoShareUpgrade({ PROMO_SHARE_UPGRADE_HEIGHT: "   " })).toBeUndefined();
  });

  test("a malformed height is refused at startup rather than defaulted", () => {
    for (const bad of ["-1", "1.5", "abc", "0x10", "1e9", "9007199254740993"]) {
      expect(() => readPromoShareUpgrade({ PROMO_SHARE_UPGRADE_HEIGHT: bad })).toThrow(
        /Invalid PROMO_SHARE_UPGRADE_HEIGHT/
      );
    }
    expect(readPromoShareUpgrade({ PROMO_SHARE_UPGRADE_HEIGHT: "25492" })).toEqual({ height: 25492 });
  });

  test("promoShareActive is false without a schedule and below the height", () => {
    expect(promoShareActive(DEFAULT_CONFIG, 1_000_000)).toBe(false);
    const scheduled = { ...DEFAULT_CONFIG, promoShareUpgrade: { height: 500 } };
    expect(promoShareActive(scheduled, 499)).toBe(false);
    expect(promoShareActive(scheduled, 500)).toBe(true);
    expect(promoShareActive(scheduled, 501)).toBe(true);
    // Height 0 is genesis and is never inside a fork.
    expect(promoShareActive({ ...DEFAULT_CONFIG, promoShareUpgrade: { height: 0 } }, 0)).toBe(false);
  });

  test("withoutPromoShareUpgrade strips only that field", () => {
    const scheduled = {
      ...DEFAULT_CONFIG,
      promoShareUpgrade: { height: 500 },
      consensusUpgrade1: { height: 400 }
    };
    const stripped = withoutPromoShareUpgrade(scheduled);
    expect(stripped.promoShareUpgrade).toBeUndefined();
    expect(stripped.consensusUpgrade1).toEqual({ height: 400 });
    // Stripping an absent field is a byte-identical no-op.
    expect(JSON.stringify(withoutPromoShareUpgrade(DEFAULT_CONFIG))).toBe(JSON.stringify(DEFAULT_CONFIG));
  });
});

/* ========================================================================== *
 * Consensus safety
 *
 * The contract the rest of this file defends: with no promo share scheduled, or scheduled but
 * not yet reached, or explicitly chosen as 0, this binary must produce the **same state root**
 * as the pre-promo-share binary — otherwise scheduling the upgrade would fork the network before
 * its own activation height.
 * ========================================================================== */

const LAUNCH_FEE = tokenCreateMinFee();

const scheduled = (height: number): NetworkConfig => ({
  ...DEFAULT_CONFIG,
  promoShareUpgrade: { height }
});

function fundTx(to: string, amount: number, nonce: number, id: string): Transaction {
  return signTransaction(DEV_FAUCET_PRIVATE_KEY, {
    chainId: DEFAULT_CONFIG.chainId,
    id,
    from: FAUCET_ADDRESS,
    to,
    amount,
    fee: 0,
    nonce,
    timestamp: 1,
    type: "transfer"
  });
}

function launchTx(
  creator: { address: string; privateKey: string },
  nonce: number,
  payload: Record<string, unknown>
): Transaction {
  return signTransaction(creator.privateKey, {
    chainId: DEFAULT_CONFIG.chainId,
    id: `launch-${nonce}-${JSON.stringify(payload.promoBps ?? "absent")}`,
    from: creator.address,
    to: creator.address,
    amount: 0,
    fee: LAUNCH_FEE,
    nonce,
    timestamp: 1,
    type: "tokenCreate",
    payload: { assetId: "gold", name: "Gold", symbol: "GOLD", decimals: 6, totalSupply: SUPPLY, ...payload }
  });
}

/**
 * A deterministic two-block chain whose block 2 is the launch, so two runs are comparable byte
 * for byte. The creator key is fixed: a random address would reorder the hashed account map and
 * make the state-root comparisons meaningless.
 *
 * Any activation height used with this helper must be **2**, so block 1 is pre-activation on
 * every variant and only the launch block can differ.
 *
 * `viaMempool: false` bypasses node-local admission, which is how a block arriving from a peer
 * is applied — that is the path that has to stay byte-identical, and the only way to observe the
 * apply path ignoring a pre-activation `promoBps`.
 */
async function launchChain(
  config: NetworkConfig,
  payload: Record<string, unknown>,
  viaMempool = true
): Promise<{ state: ChainState; config: NetworkConfig; creator: { address: string; privateKey: string } }> {
  const liveConfig = structuredClone(config);
  const state = createInitialState(liveConfig);
  const kp = keyPairFromPrivateKey("11".repeat(32));

  enqueueTransaction(state, fundTx(kp.address, 100, 0, "fund-creator"));
  await buildBlock(state, "bootstrap-validator", liveConfig, process.env.BOOTSTRAP_PRIVATE_KEY);
  expect(state.chain.at(-1)!.header.height).toBe(1);

  const launch = signTransaction(kp.privateKey, {
    chainId: DEFAULT_CONFIG.chainId,
    id: "launch",
    from: kp.address,
    to: kp.address,
    amount: 0,
    fee: LAUNCH_FEE,
    nonce: 0,
    timestamp: 1,
    type: "tokenCreate",
    payload: { assetId: "gold", name: "Gold", symbol: "GOLD", decimals: 6, totalSupply: SUPPLY, ...payload }
  });
  if (viaMempool) {
    enqueueTransaction(state, launch);
    await buildBlock(state, "bootstrap-validator", liveConfig, process.env.BOOTSTRAP_PRIVATE_KEY);
  } else {
    state.mempool.push(launch);
    await buildBlock(state, "bootstrap-validator", liveConfig, process.env.BOOTSTRAP_PRIVATE_KEY);
  }
  expect(state.assets.gold).toBeDefined();
  return { state, config: liveConfig, creator: { address: kp.address, privateKey: kp.privateKey } };
}

describe("promo share — byte-identity below activation", () => {
  test("genesis identity does not move when the upgrade is scheduled", () => {
    const base = createGenesisBlock(DEFAULT_CONFIG);
    const withSchedule = createGenesisBlock(scheduled(25_492));
    expect(withSchedule.header.stateRoot).toBe(base.header.stateRoot);
    expect(withSchedule.hash).toBe(base.hash);
  });

  test("an empty promo map is not hashed at all", () => {
    const a = createInitialState();
    const b = createInitialState();
    delete b.promoPools;
    expect(computeStateRoot(b)).toBe(computeStateRoot(a));
    b.promoPools = {};
    expect(computeStateRoot(b)).toBe(computeStateRoot(a));
  });

  test("a legacy launch is byte-identical with and without a far-future schedule", async () => {
    const legacy = await launchChain(DEFAULT_CONFIG, {});
    const upgraded = await launchChain(scheduled(1_000_000), {});
    expect(computeStateRoot(upgraded.state)).toBe(computeStateRoot(legacy.state));
    expect(upgraded.state.chain.at(-1)!.header.stateRoot).toBe(legacy.state.chain.at(-1)!.header.stateRoot);
    expect(upgraded.state.assets.gold!.allocation).toEqual(legacy.state.assets.gold!.allocation);
    expect(upgraded.state.promoPools).toEqual({});
  });

  test("an explicit promoBps: 0 above the height produces the legacy launch state", async () => {
    const legacy = await launchChain(DEFAULT_CONFIG, {});
    const zero = await launchChain(scheduled(2), { promoBps: 0 });
    expect(zero.state.assets.gold!.allocation!.bondingCurve).toBe(SUPPLY * 0.6);
    // No `promo` key on the hashed allocation and no pool record.
    expect(Object.keys(zero.state.assets.gold!.allocation!)).not.toContain("promo");
    expect(zero.state.promoPools).toEqual({});
    expect(zero.state.assets).toEqual(legacy.state.assets);
    expect(zero.state.curves).toEqual(legacy.state.curves);
    expect(zero.state.communityPool).toEqual(legacy.state.communityPool);
    expect(zero.state.vesting).toEqual(legacy.state.vesting);
    expect(zero.state.accounts).toEqual(legacy.state.accounts);

    // The *only* difference in the hashed state is the schedule itself, which becomes committed
    // configuration at its activation height — the same rule `securityUpgrade` already follows
    // (docs/AUDIT-CRITICAL-FIXES.md, "Coordinated testnet activation procedure"). Strip it and
    // the two roots are identical, which is what makes a 0% launch a no-op economically.
    expect(zero.state.networkConfig!.promoShareUpgrade).toEqual({ height: 2 });
    delete zero.state.networkConfig!.promoShareUpgrade;
    expect(computeStateRoot(zero.state)).toBe(computeStateRoot(legacy.state));
  });

  test("promoBps below the activation height is ignored, exactly as a pre-upgrade binary ignores it", async () => {
    const legacy = await launchChain(DEFAULT_CONFIG, {});
    // The launch lands in block 2 while the schedule sits far above it. Mempool admission would
    // refuse this transaction, so it is injected on the apply path a peer's block takes.
    const ignored = await launchChain(scheduled(1_000_000), { promoBps: PROMO_BPS_HIGH }, false);
    expect(computeStateRoot(ignored.state)).toBe(computeStateRoot(legacy.state));
    expect(ignored.state.assets.gold!.allocation!.bondingCurve).toBe(SUPPLY * 0.6);
    expect(ignored.state.promoPools).toEqual({});
  });

  test("a node with no schedule replays a promo-aware node's pre-activation blocks exactly", async () => {
    const { state } = await launchChain(scheduled(1_000_000), {});
    const follower = createInitialState(DEFAULT_CONFIG);
    for (const block of state.chain.slice(1)) {
      expect(await tryApplyRemoteBlock(follower, block, structuredClone(DEFAULT_CONFIG))).toBe(true);
    }
    expect(follower.chain.at(-1)!.hash).toBe(state.chain.at(-1)!.hash);
    expect(computeStateRoot(follower)).toBe(computeStateRoot(state));
  });

  test("the mempool refuses promoBps before activation instead of silently zeroing it", async () => {
    const state = createInitialState(structuredClone(DEFAULT_CONFIG));
    const kp = generateKeyPair();
    enqueueTransaction(state, fundTx(kp.address, 100, 0, "fund"));
    await buildBlock(state, "bootstrap-validator", state.networkConfig!, process.env.BOOTSTRAP_PRIVATE_KEY);
    expect(() => enqueueTransaction(state, launchTx(kp, 0, { promoBps: PROMO_BPS_LOW }))).toThrow(
      /promo share is not active/
    );
    // ...and a value that will never be accepted is refused at submit time once it is active.
    const live = createInitialState(scheduled(2));
    const kp2 = generateKeyPair();
    ensureAccount(live, kp2.address).balance = 100;
    live.accounts[kp2.address]!.balances[NATIVE_ASSET_ID] = 100;
    await buildBlock(live, "bootstrap-validator", live.networkConfig!, process.env.BOOTSTRAP_PRIVATE_KEY);
    expect(() => enqueueTransaction(live, launchTx(kp2, 0, { promoBps: 750 }))).toThrow(/Invalid promo share/);
  });

  test("a promo transaction is rejected on a network without the upgrade", async () => {
    const state = createInitialState(structuredClone(DEFAULT_CONFIG));
    const kp = generateKeyPair();
    ensureAccount(state, kp.address).balance = 100;
    state.accounts[kp.address]!.balances[NATIVE_ASSET_ID] = 100;
    await buildBlock(state, "bootstrap-validator", state.networkConfig!, process.env.BOOTSTRAP_PRIVATE_KEY);
    const tx = signTransaction(kp.privateKey, {
      chainId: DEFAULT_CONFIG.chainId,
      id: "award", from: kp.address, to: kp.address, amount: 0, fee: DEFAULT_TRANSFER_FEE,
      nonce: 0, timestamp: 1, type: "promoAward", payload: { assetId: "gold", recipient: kp.address, amount: 1 }
    });
    expect(() => applyTransaction(state, tx, state.networkConfig!)).toThrow(/promo share is not active/);
    // ...and node-local admission refuses it at submit time too, so a hopeless transaction never
    // occupies the sender's single mempool slot (same reason as the `promoBps` guard above).
    expect(() => enqueueTransaction(state, tx)).toThrow(/promo share is not active/);
  });

  test("the three pool transactions are refused by the mempool below the activation height", async () => {
    // Scheduled far above the head: the feature exists on this node but is not live yet.
    const state = createInitialState(scheduled(500_000));
    const kp = generateKeyPair();
    ensureAccount(state, kp.address).balance = 100;
    state.accounts[kp.address]!.balances[NATIVE_ASSET_ID] = 100;
    await buildBlock(state, "bootstrap-validator", state.networkConfig!, process.env.BOOTSTRAP_PRIVATE_KEY);
    for (const type of ["promoAward", "promoClaim", "promoReturn"] as const) {
      const tx = signTransaction(kp.privateKey, {
        chainId: DEFAULT_CONFIG.chainId,
        id: type, from: kp.address, to: kp.address, amount: 0, fee: DEFAULT_TRANSFER_FEE,
        nonce: 0, timestamp: 1, type,
        payload: { assetId: "gold", recipient: ALICE, amount: 1 }
      });
      expect(() => enqueueTransaction(state, tx)).toThrow(/promo share is not active/);
      expect(state.mempool).toHaveLength(0);
    }
  });
});

describe("promo share — launch above activation", () => {
  test("500 bps opens the curve at 55% and leaves every other bucket untouched", async () => {
    const legacy = await launchChain(DEFAULT_CONFIG, {});
    const { state } = await launchChain(scheduled(2), { promoBps: PROMO_BPS_LOW });
    const allocation = state.assets.gold!.allocation!;
    expect(allocation.bondingCurve).toBe(SUPPLY * 0.55);
    expect(allocation.promo).toBe(SUPPLY * 0.05);
    expect(allocation.communityPool).toBe(legacy.state.assets.gold!.allocation!.communityPool);
    expect(allocation.creator).toBe(legacy.state.assets.gold!.allocation!.creator);
    expect(state.communityPool.pools.gold).toEqual(legacy.state.communityPool.pools.gold);
    expect(state.vesting.gold).toEqual(legacy.state.vesting.gold);
    expect(state.liquidityReserves.gold).toBe(legacy.state.liquidityReserves.gold);
    expect(state.ecosystemReserves.gold).toBe(legacy.state.ecosystemReserves.gold);
    // The curve really opens smaller, inventory and invariant alike.
    expect(state.curves.gold!.initialCurveAllocation).toBe(SUPPLY * 0.55);
    expect(state.curves.gold!.currentTokenReserve).toBe(SUPPLY * 0.55);
    expect(state.curves.gold!.migrationThreshold).toBe(Math.floor((SUPPLY * 0.55) / 3));
    expect(state.curves.gold!.initialPriceReference).toBe(legacy.state.curves.gold!.initialPriceReference);
  });

  test("1000 bps opens the curve at 50% and the pool holds 10% of supply", async () => {
    const { state, creator } = await launchChain(scheduled(2), { promoBps: PROMO_BPS_HIGH });
    expect(state.curves.gold!.initialCurveAllocation).toBe(SUPPLY * 0.5);
    const pool = state.promoPools!.gold!;
    expect(pool).toMatchObject({
      assetId: "gold",
      creator: creator.address,
      promoBps: PROMO_BPS_HIGH,
      total: SUPPLY * 0.1,
      awarded: 0,
      claimed: 0,
      closed: false,
      durationBlocks: PROMO_VESTING_BLOCKS,
      windowBlocks: PROMO_WINDOW_BLOCKS
    });
    // Promo tokens are not credited to the creator: only the 10% upfront creator vesting is.
    expect(getAccountBalance(state.accounts[creator.address]!, "gold")).toBe(SUPPLY * 0.15 * 0.1);
  });

  test("the launch conserves supply across every bucket", async () => {
    for (const bps of [PROMO_BPS_LOW, PROMO_BPS_HIGH]) {
      const { state } = await launchChain(scheduled(2), { promoBps: bps });
      const a = state.assets.gold!.allocation!;
      const sum =
        a.bondingCurve + a.communityPool + a.creator + a.liquidityReserve + a.ecosystemReserve +
        (state.promoPools!.gold!.total);
      expect(sum).toBe(SUPPLY);
      expect(a.promo).toBe(state.promoPools!.gold!.total);
    }
  });

  test("a promo launch changes the state root, and only then", async () => {
    const zero = await launchChain(scheduled(2), { promoBps: 0 });
    const promo = await launchChain(scheduled(2), { promoBps: PROMO_BPS_HIGH });
    expect(computeStateRoot(promo.state)).not.toBe(computeStateRoot(zero.state));
  });

  test("a follower with the same activation height replays a promo launch exactly", async () => {
    const { state } = await launchChain(scheduled(2), { promoBps: PROMO_BPS_HIGH });
    const follower = createInitialState(scheduled(2));
    for (const block of state.chain.slice(1)) {
      expect(await tryApplyRemoteBlock(follower, block, scheduled(2))).toBe(true);
    }
    expect(computeStateRoot(follower)).toBe(computeStateRoot(state));
    expect(follower.promoPools!.gold!.total).toBe(SUPPLY * 0.1);
  });

  test("a follower without the activation height rejects the promo block (coordinated upgrade required)", async () => {
    const { state } = await launchChain(scheduled(2), { promoBps: PROMO_BPS_HIGH });
    const follower = createInitialState(DEFAULT_CONFIG);
    const blocks = state.chain.slice(1);
    // The pre-launch block still applies; the launch block's state root cannot be reproduced.
    expect(await tryApplyRemoteBlock(follower, blocks[0]!, structuredClone(DEFAULT_CONFIG))).toBe(true);
    expect(await tryApplyRemoteBlock(follower, blocks[1]!, structuredClone(DEFAULT_CONFIG))).toBe(false);
  });
});

describe("promo share — pool transactions", () => {
  /** Move the head to `height` so the pool's 180-day clock is reachable in a unit test. */
  function warpTo(state: ChainState, height: number): void {
    const head = state.chain.at(-1)! as Block;
    head.header.height = height;
  }

  /**
   * A promo launch plus a funded recipient and stranger. Everything is funded by a real faucet
   * transfer in a real block, so the chain is self-contained and replayable — an out-of-band
   * balance poke on the producer would make the follower unable to reproduce the state root.
   */
  async function promoLaunch() {
    const { state, config, creator } = await launchChain(scheduled(2), { promoBps: PROMO_BPS_HIGH });
    const recipient = keyPairFromPrivateKey("22".repeat(32));
    const stranger = keyPairFromPrivateKey("33".repeat(32));
    enqueueTransaction(state, fundTx(recipient.address, 10, 1, "fund-recipient"));
    await buildBlock(state, "bootstrap-validator", config, process.env.BOOTSTRAP_PRIVATE_KEY);
    enqueueTransaction(state, fundTx(stranger.address, 10, 2, "fund-stranger"));
    await buildBlock(state, "bootstrap-validator", config, process.env.BOOTSTRAP_PRIVATE_KEY);
    return { state, config, creator, recipient, stranger };
  }

  function promoTx(
    key: { address: string; privateKey: string },
    type: "promoAward" | "promoClaim" | "promoReturn",
    nonce: number,
    payload: Record<string, unknown>
  ): Transaction {
    return signTransaction(key.privateKey, {
      chainId: DEFAULT_CONFIG.chainId,
      id: `${type}-${nonce}`,
      from: key.address,
      to: key.address,
      amount: 0,
      fee: DEFAULT_TRANSFER_FEE,
      nonce,
      timestamp: 1,
      type,
      payload
    });
  }

  test("creator awards, recipient claims as it vests, and the fee is charged once", async () => {
    const { state, config, creator, recipient } = await promoLaunch();
    const pool = state.promoPools!.gold!;
    const cap = promoRecipientCap(pool);
    const creatorNativeBefore = state.accounts[creator.address]!.balance;

    applyPromoTransaction(
      state,
      promoTx(creator, "promoAward", 1, { assetId: "gold", recipient: recipient.address, amount: cap }),
      config
    );
    expect(pool.awarded).toBe(cap);
    expect(state.accounts[creator.address]!.balance).toBeCloseTo(creatorNativeBefore - DEFAULT_TRANSFER_FEE, 9);
    // Awarding moves nothing yet.
    expect(getAccountBalance(state.accounts[recipient.address]!, "gold")).toBe(0);

    // 10% is claimable immediately.
    applyPromoTransaction(state, promoTx(recipient, "promoClaim", 0, { assetId: "gold" }), config);
    expect(getAccountBalance(state.accounts[recipient.address]!, "gold")).toBe(cap * 0.1);

    // Halfway through the 180-day vesting: another 45%.
    const awardBlock = pool.awards[recipient.address]![0]!.startBlock;
    warpTo(state, awardBlock + PROMO_VESTING_BLOCKS / 2);
    expect(promoClaimableOf(pool, recipient.address, awardBlock + PROMO_VESTING_BLOCKS / 2)).toBe(cap * 0.45);
    applyPromoTransaction(state, promoTx(recipient, "promoClaim", 1, { assetId: "gold" }), config);
    expect(getAccountBalance(state.accounts[recipient.address]!, "gold")).toBe(cap * 0.55);

    // After the horizon, the rest.
    warpTo(state, awardBlock + PROMO_VESTING_BLOCKS);
    applyPromoTransaction(state, promoTx(recipient, "promoClaim", 2, { assetId: "gold" }), config);
    expect(getAccountBalance(state.accounts[recipient.address]!, "gold")).toBe(cap);
    expect(pool.claimed).toBe(cap);
  });

  test("nobody but the creator can award, and never to the creator or the faucet", async () => {
    const { state, config, creator, recipient } = await promoLaunch();
    expect(() =>
      applyPromoTransaction(
        state,
        promoTx(recipient, "promoAward", 0, { assetId: "gold", recipient: creator.address, amount: 1 }),
        config
      )
    ).toThrow(/Only the token creator/);
    expect(() =>
      applyPromoTransaction(
        state,
        promoTx(creator, "promoAward", 1, { assetId: "gold", recipient: creator.address, amount: 1 }),
        config
      )
    ).toThrow(/Invalid promo recipient/);
    expect(() =>
      applyPromoTransaction(
        state,
        promoTx(creator, "promoAward", 1, { assetId: "gold", recipient: FAUCET_ADDRESS, amount: 1 }),
        config
      )
    ).toThrow(/Invalid promo recipient/);
    expect(() =>
      applyPromoTransaction(
        state,
        promoTx(creator, "promoAward", 1, { assetId: "gold", recipient: "not-an-address", amount: 1 }),
        config
      )
    ).toThrow(/Invalid promo recipient address/);
  });

  test("an unknown asset has no pool", async () => {
    const { state, config, creator } = await promoLaunch();
    expect(() =>
      applyPromoTransaction(state, promoTx(creator, "promoClaim", 1, { assetId: "silver" }), config)
    ).toThrow(/No promo pool found/);
  });

  test("after 180 days anyone returns the unused remainder to this token's Community Pool", async () => {
    const { state, config, creator, recipient, stranger } = await promoLaunch();
    const pool = state.promoPools!.gold!;
    const cap = promoRecipientCap(pool);
    applyPromoTransaction(
      state,
      promoTx(creator, "promoAward", 1, { assetId: "gold", recipient: recipient.address, amount: cap }),
      config
    );
    const communityBefore = state.communityPool.pools.gold!.remainingBalance;

    // Still inside the window.
    warpTo(state, promoDeadline(pool) - 1);
    expect(() =>
      applyPromoTransaction(state, promoTx(recipient, "promoReturn", 0, { assetId: "gold" }), config)
    ).toThrow(/window is open/);

    // A third party — not the creator, not the recipient — closes it.
    warpTo(state, promoDeadline(pool));
    applyPromoTransaction(state, promoTx(stranger, "promoReturn", 0, { assetId: "gold" }), config);

    expect(pool.closed).toBe(true);
    expect(state.communityPool.pools.gold!.remainingBalance).toBe(communityBefore + (pool.total - cap));
    // Nothing went to the creator, and the awarded part is still the recipient's to claim on its
    // own clock (the award was made after the launch, so it vests a little later than the pool).
    expect(getAccountBalance(state.accounts[creator.address]!, "gold")).toBe(SUPPLY * 0.15 * 0.1);
    warpTo(state, pool.awards[recipient.address]![0]!.startBlock + PROMO_VESTING_BLOCKS);
    applyPromoTransaction(state, promoTx(recipient, "promoClaim", 0, { assetId: "gold" }), config);
    expect(getAccountBalance(state.accounts[recipient.address]!, "gold")).toBe(cap);
    // And it cannot be returned twice.
    expect(() =>
      applyPromoTransaction(state, promoTx(stranger, "promoReturn", 1, { assetId: "gold" }), config)
    ).toThrow(/already returned/);
  });

  test("promo transactions go through the block path and survive replay", async () => {
    const { state, config, creator, recipient } = await promoLaunch();
    const cap = promoRecipientCap(state.promoPools!.gold!);
    enqueueTransaction(
      state,
      promoTx(creator, "promoAward", 1, { assetId: "gold", recipient: recipient.address, amount: cap })
    );
    await buildBlock(state, "bootstrap-validator", config, process.env.BOOTSTRAP_PRIVATE_KEY);
    expect(state.chain.at(-1)!.transactions.map(tx => tx.type)).toContain("promoAward");
    expect(state.promoPools!.gold!.awarded).toBe(cap);

    const follower = createInitialState(scheduled(2));
    for (const block of state.chain.slice(1)) {
      expect(await tryApplyRemoteBlock(follower, block, scheduled(2))).toBe(true);
    }
    expect(computeStateRoot(follower)).toBe(computeStateRoot(state));
    expect(follower.promoPools!.gold!.awards[recipient.address]).toHaveLength(1);
  });
});

/* ========================================================================== *
 * Fee routing
 *
 * `docs/PROTOCOL-DECISIONS.md` and `docs/protocol-decisions/promo-share.md`: the three pool
 * transactions "carry the ordinary `DEFAULT_TRANSFER_FEE` and route it through Model A
 * 30/25/20/10/15/0 exactly like every other eligible `tx.fee` — no new public tariff". If they
 * are missing from the protocol-fee set the whole fee lands in `pendingValidatorFees` instead
 * and the community / treasury / liquidity / Growth buckets get nothing.
 * ========================================================================== */

describe("promo share — fee routing", () => {
  const FEE_ATOMS = pplToAtoms(DEFAULT_TRANSFER_FEE);

  test("each pool transaction fee is an eligible protocol_tx_fee, exactly like creatorClaim", () => {
    for (const txType of ["promoAward", "promoClaim", "promoReturn"] as const) {
      expect(listEligibleFeeComponents({ txType, txFee: FEE_ATOMS })).toEqual([
        { source: "protocol_tx_fee", amount: FEE_ATOMS }
      ]);
      // A zero fee is not a fee: nothing to split, nothing to route.
      expect(listEligibleFeeComponents({ txType, txFee: 0 })).toEqual([]);
    }
    // The reference type the promo transactions are modelled on.
    expect(listEligibleFeeComponents({ txType: "creatorClaim", txFee: FEE_ATOMS })).toEqual([
      { source: "protocol_tx_fee", amount: FEE_ATOMS }
    ]);
  });

  test("a promoAward block splits the fee 30/25/20/10/15/0 instead of paying it all to validators", async () => {
    const { state, config, creator } = await launchChain(scheduled(2), { promoBps: PROMO_BPS_HIGH });
    const recipient = keyPairFromPrivateKey("44".repeat(32));
    const split = calculateApprovedFeeSplit(FEE_ATOMS, growthFeeSplitSwitch());
    expect(split.active).toBe(true);
    expect(split.growthAmount).toBeGreaterThan(0);

    const before = {
      pendingValidatorFees: state.pendingValidatorFees ?? 0,
      growthInflow: state.growthPool.totalInflow,
      liquidity: state.feeLiquidityEcosystem,
      treasury: state.treasury?.[NATIVE_ASSET_ID] ?? 0,
      community: state.communityPool.pools[NATIVE_ASSET_ID]?.remainingBalance ?? 0
    };

    enqueueTransaction(
      state,
      signTransaction(creator.privateKey, {
        chainId: DEFAULT_CONFIG.chainId,
        id: "award-fee", from: creator.address, to: creator.address, amount: 0, fee: DEFAULT_TRANSFER_FEE,
        nonce: 1, timestamp: 1, type: "promoAward",
        payload: { assetId: "gold", recipient: recipient.address, amount: 1_000 }
      })
    );
    await buildBlock(state, "bootstrap-validator", config, process.env.BOOTSTRAP_PRIVATE_KEY);
    expect(state.chain.at(-1)!.transactions.map(tx => tx.type)).toContain("promoAward");
    // The block must not be an epoch boundary, or `pendingValidatorFees` would be zeroed and the
    // comparison below would pass for the wrong reason.
    expect(state.chain.at(-1)!.header.height % 10).not.toBe(0);

    // Model A ran: the whole fee did NOT go to validators as an undivided lump.
    expect(state.pendingValidatorFees ?? 0).toBe(before.pendingValidatorFees);
    expect(state.growthPool.totalInflow - before.growthInflow).toBe(split.growthAmount);
    expect(state.feeLiquidityEcosystem - before.liquidity).toBe(split.liquidityAmount);
    // No validator is active on this fixture, so Model A's own 30% validator share falls back to
    // the treasury (`payValidatorFeeShare`) — which is itself proof the 30% went through Model A
    // rather than through the undivided `pendingValidatorFees` lump.
    expect((state.treasury?.[NATIVE_ASSET_ID] ?? 0) - before.treasury).toBeCloseTo(
      (split.treasuryAmount + split.validatorAmount) / PPL_SCALE,
      12
    );
    expect(
      (state.communityPool.pools[NATIVE_ASSET_ID]?.remainingBalance ?? 0) - before.community
    ).toBeCloseTo(split.communityAmount / PPL_SCALE, 12);
  });
});

describe("promo share — fully awarded pool", () => {
  test("returnUnused closes a fully awarded pool with a zero remainder, mirroring the vault", () => {
    const p = pool();
    const cap = promoRecipientCap(p);
    // 10 recipients at the 1000-bps per-recipient cap is the whole pool, exactly.
    expect(cap * 10).toBe(p.total);
    for (let index = 0; index < 10; index += 1) {
      awardPromo(p, CREATOR, `0x${index.toString(16).repeat(40).slice(0, 40)}`, cap, p.startBlock + 1);
    }
    expect(p.awarded).toBe(p.total);
    expect(promoUndistributed(p)).toBe(0);
    // Nothing is left, so nothing more can be committed...
    expect(() => awardPromo(p, CREATOR, ALICE, 1, p.startBlock + 2)).toThrow(/exceeds the undistributed pool/);
    // ...and the window still closes, with a zero credit to the Community Pool rather than a throw
    // (`PromoRewardsVault.returnUnused` takes the same `amount == 0` path).
    expect(returnUnusedPromo(p, promoDeadline(p))).toBe(0);
    expect(p.closed).toBe(true);
    expect(() => returnUnusedPromo(p, promoDeadline(p))).toThrow(/already returned/);
  });
});
