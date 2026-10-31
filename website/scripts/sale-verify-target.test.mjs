import assert from "node:assert/strict";
import test from "node:test";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { getVerifierSignerForVersion } from "../src/lib/sale/verifier/signer.ts";
import { resolveVerifyTarget, saleOwnershipMessage } from "../src/lib/sale/verify-target.ts";

const V1 = "0x1111111111111111111111111111111111111111";
const V2 = "0x2222222222222222222222222222222222222222";
const KEY_V1 = `0x${"11".repeat(32)}`;
const KEY_V2 = `0x${"22".repeat(32)}`;

const ENV_KEYS = [
  "SALE_VERIFIER_MODE",
  "SALE_VERIFIER_LOCAL_KEY",
  "SALE_VERIFIER_KMS_KEY_ID",
  "SALE_V2_VERIFIER_MODE",
  "SALE_V2_VERIFIER_LOCAL_KEY",
  "SALE_V2_VERIFIER_KMS_KEY_ID",
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved) {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

test("v2 verify config never uses the v1 hub, chain or signer", async () => {
  const saved = snapshotEnv();
  try {
    const env = {
      NEXT_PUBLIC_SALE_HUB_ADDRESS: V1,
      NEXT_PUBLIC_PPL_V2_HUB_ADDRESS: V2,
      NEXT_PUBLIC_PPL_V2_CHAIN_ID: "84532",
    };
    const v1 = resolveVerifyTarget("v1", env);
    const v2 = resolveVerifyTarget("v2", env);
    assert.equal(v1.hub, V1);
    assert.equal(v1.chainId, 8453);
    assert.equal(v1.signerModeEnv, "SALE_VERIFIER_MODE");
    assert.equal(v1.signerLocalKeyEnv, "SALE_VERIFIER_LOCAL_KEY");
    assert.equal(v1.signerKmsKeyIdVar, "SALE_VERIFIER_KMS_KEY_ID");
    assert.equal(v2.hub, V2);
    assert.equal(v2.chainId, 84532);
    assert.equal(v2.signerModeEnv, "SALE_V2_VERIFIER_MODE");
    assert.equal(v2.signerLocalKeyEnv, "SALE_V2_VERIFIER_LOCAL_KEY");
    assert.equal(v2.signerKmsKeyIdVar, "SALE_V2_VERIFIER_KMS_KEY_ID");
    assert.equal(resolveVerifyTarget("v2", { NEXT_PUBLIC_SALE_HUB_ADDRESS: V1 }).hub, null);
    assert.equal(
      resolveVerifyTarget("v1", { NEXT_PUBLIC_PPL_V2_HUB_ADDRESS: V2, NEXT_PUBLIC_PPL_V2_CHAIN_ID: "84532" }).hub,
      null,
    );

    const account = privateKeyToAccount(KEY_V1);
    const fields = {
      domain: "https://example.com/",
      account: account.address,
      nonceCode: "nonce-1",
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:15:00.000Z",
    };
    const v2Message = saleOwnershipMessage(v2, fields);
    const v1Message = saleOwnershipMessage(v1, fields);
    assert.match(v2Message, /84532/);
    assert.match(v2Message, new RegExp(V2.slice(2), "i"));
    assert.doesNotMatch(v2Message, /8453\n/);
    assert.match(v1Message, new RegExp(V1.slice(2), "i"));
    assert.doesNotMatch(v2Message, new RegExp(V1.slice(2), "i"));
    const signature = await account.signMessage({ message: v2Message });
    assert.equal(await verifyMessage({ address: account.address, message: v2Message, signature }), true);
    assert.equal(await verifyMessage({ address: account.address, message: v1Message, signature }), false);

    process.env.SALE_VERIFIER_MODE = "local";
    process.env.SALE_V2_VERIFIER_MODE = "local";
    process.env.SALE_VERIFIER_LOCAL_KEY = KEY_V1;
    process.env.SALE_V2_VERIFIER_LOCAL_KEY = KEY_V2;
    const signerV1 = await getVerifierSignerForVersion("v1", 84532);
    const signerV2 = await getVerifierSignerForVersion("v2", 84532);
    assert.equal(await signerV1.getAddress(), privateKeyToAccount(KEY_V1).address);
    assert.equal(await signerV2.getAddress(), privateKeyToAccount(KEY_V2).address);
    delete process.env.SALE_VERIFIER_LOCAL_KEY;
    await assert.rejects(() => getVerifierSignerForVersion("v1", 84532));
    assert.equal(await (await getVerifierSignerForVersion("v2", 84532)).getAddress(), privateKeyToAccount(KEY_V2).address);
    assert.doesNotMatch(v2Message, new RegExp(V1.slice(2), "i"));

    process.env.SALE_V2_VERIFIER_MODE = "kms";
    process.env.SALE_VERIFIER_KMS_KEY_ID = "v1-key";
    delete process.env.SALE_V2_VERIFIER_KMS_KEY_ID;
    await assert.rejects(() => getVerifierSignerForVersion("v2", 8453), /SALE_V2_VERIFIER_KMS_KEY_ID/);
  } finally {
    restoreEnv(saved);
  }
});
