import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isLegacyWalletProvider, isTurnkeyWalletProvider, readWalletProvider } from "./wallet-provider-flag.ts";

const KEYS = ["WALLET_PROVIDER", "NEXT_PUBLIC_WALLET_PROVIDER"] as const;

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("WALLET_PROVIDER", () => {
  afterEach(() => {
    for (const key of KEYS) delete process.env[key];
  });

  it("defaults to legacy so production stays on the vault", () => {
    withEnv({}, () => {
      assert.equal(readWalletProvider(), "legacy");
      assert.equal(isLegacyWalletProvider(), true);
      assert.equal(isTurnkeyWalletProvider(), false);
    });
  });

  it("enables turnkey only for the exact flag value", () => {
    withEnv({ WALLET_PROVIDER: "turnkey" }, () => {
      assert.equal(readWalletProvider(), "turnkey");
      assert.equal(isTurnkeyWalletProvider(), true);
    });
    withEnv({ WALLET_PROVIDER: "TURNKEY" }, () => {
      assert.equal(readWalletProvider(), "turnkey");
    });
    withEnv({ WALLET_PROVIDER: "legacy" }, () => {
      assert.equal(readWalletProvider(), "legacy");
    });
    withEnv({ WALLET_PROVIDER: "something-else" }, () => {
      assert.equal(readWalletProvider(), "legacy");
    });
  });
});
