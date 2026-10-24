import assert from "node:assert/strict";
import test from "node:test";

import { FAUCET_AMOUNT_USDC, runFaucet, testTokenAbi } from "./useTestFaucet.ts";

test("faucet mints 1000 test USDC via mint(address,uint256)", () => {
  assert.equal(FAUCET_AMOUNT_USDC, 1000);
  assert.equal(testTokenAbi[0].name, "mint");
  assert.deepEqual(testTokenAbi[0].inputs.map((i) => i.type), ["address", "uint256"]);
});

test("outside base-test the faucet refuses without touching the wallet", async () => {
  const provider = {
    request: async () => {
      throw new Error("wallet must not be called");
    },
  };
  const seen: string[] = [];
  const result = await runFaucet(
    { provider: provider as never, account: "0x1111111111111111111111111111111111111111" },
    (s) => seen.push(s.step),
  );
  assert.deepEqual(result, { step: "error", reason: "notConfigured" });
  assert.deepEqual(seen, ["error"]);
});
