import { describe, expect, test } from "vitest";
import {
  DEFAULT_CONFIG,
  NATIVE_ASSET_ID,
  applyTransaction,
  createInitialState,
  ensureAccount,
  generateKeyPair,
  signTransaction
} from "./index.js";
import type { ChainState } from "./index.js";
import type { NetworkConfig, Transaction } from "@people/protocol";

/**
 * M04-3: `joinValidator` assigned `state.validators[tx.from]` unconditionally, so a validator
 * could overwrite their own record — resetting stake, referral and scores, or clearing
 * `jailUntilEpoch` after a slash — by sending a second join. Behind the security-upgrade height,
 * only a retired record (already unstaked) may be replaced.
 */

const JOIN_FEE = 0.004875;

const upgradeConfig = (height: number, allowlist: string[] = []): NetworkConfig => ({
  ...DEFAULT_CONFIG,
  securityUpgrade: { height, validatorAllowlist: allowlist }
});

function joinTx(
  state: ChainState,
  key: { address: string; privateKey: string },
  nonce: number,
  amount = 100,
  id = "join"
): Transaction {
  return signTransaction(
    key.privateKey,
    {
      chainId: DEFAULT_CONFIG.chainId,
      id,
      from: key.address,
      to: "network",
      amount,
      fee: JOIN_FEE,
      nonce,
      timestamp: 1,
      type: "joinValidator",
      payload: { nodeKind: "full" }
    },
    true
  );
}

/** A state whose chain has one block of headroom, with `key` funded well past `minStake`. */
function funded(config: NetworkConfig, key: { address: string; privateKey: string }): ChainState {
  const state = createInitialState(config);
  const account = ensureAccount(state, key.address);
  account.balance = 1_000_000;
  account.balances[NATIVE_ASSET_ID] = 1_000_000;
  return state;
}

describe("joinValidator may not overwrite an existing record (M04-3)", () => {
  test("a second join is rejected and the first stake survives", () => {
    const user = generateKeyPair();
    const config = upgradeConfig(1, [user.address]);
    const state = funded(config, user);

    applyTransaction(state, joinTx(state, user, 0), config);
    expect(state.validators[user.address]!.status).toBe("joining");

    const second = joinTx(state, user, 1, 500, "join-again");
    expect(() => applyTransaction(state, second, config)).toThrow(/already joined/);
    expect(state.validators[user.address]!.stake).toBe(100);
    expect(state.accounts[user.address]!.nonce).toBe(1);
    expect(state.validators[user.address]!.status).toBe("joining");
  });

  test("a jailed validator cannot clear the jail by rejoining", () => {
    const user = generateKeyPair();
    const config = upgradeConfig(1, [user.address]);
    const state = funded(config, user);
    applyTransaction(state, joinTx(state, user, 0), config);
    state.validators[user.address]!.status = "slashed";
    state.validators[user.address]!.jailUntilEpoch = 99;

    expect(() => applyTransaction(state, joinTx(state, user, 1, 500, "join-jail"), config)).toThrow(
      /already joined/
    );
    expect(state.validators[user.address]!.status).toBe("slashed");
    expect(state.validators[user.address]!.jailUntilEpoch).toBe(99);
  });

  test("an offline validator that still holds stake cannot be clobbered", () => {
    const user = generateKeyPair();
    const config = upgradeConfig(1, [user.address]);
    const state = funded(config, user);
    applyTransaction(state, joinTx(state, user, 0), config);
    // `markOfflineValidators` parks an active validator as "inactive" while it keeps its stake.
    state.validators[user.address]!.status = "inactive";

    expect(() => applyTransaction(state, joinTx(state, user, 1, 500, "join-offline"), config)).toThrow(
      /already joined/
    );
    expect(state.validators[user.address]!.stake).toBe(100);
  });

  test("a validator who exited and unstaked may join again", () => {
    const user = generateKeyPair();
    const config = upgradeConfig(1, [user.address]);
    const state = funded(config, user);
    applyTransaction(state, joinTx(state, user, 0), config);
    // What `unstake` leaves behind: retired, zero stake.
    state.validators[user.address]!.status = "inactive";
    state.validators[user.address]!.stake = 0;

    applyTransaction(state, joinTx(state, user, 1, 150, "join-rejoin"), config);
    expect(state.validators[user.address]!.status).toBe("joining");
    expect(state.validators[user.address]!.stake).toBe(150);
  });

  test("below the upgrade height a rejoin still overwrites", () => {
    const user = generateKeyPair();
    const config = upgradeConfig(50);
    const state = funded(config, user);
    // No allowlist is enforced below the height, so an off-list address can join here.
    applyTransaction(state, joinTx(state, user, 0), config);
    applyTransaction(state, joinTx(state, user, 1, 250, "join-legacy"), config);
    expect(state.validators[user.address]!.stake).toBe(250);
  });

  test("without a security upgrade configured a rejoin still overwrites", () => {
    const user = generateKeyPair();
    const config: NetworkConfig = { ...DEFAULT_CONFIG, securityUpgrade: undefined };
    const state = funded(config, user);
    applyTransaction(state, joinTx(state, user, 0), config);
    applyTransaction(state, joinTx(state, user, 1, 250, "join-default"), config);
    expect(state.validators[user.address]!.stake).toBe(250);
  });
});
