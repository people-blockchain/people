import { describe, expect, test } from "vitest";
import { resolveFaucetIdentity } from "./faucet-identity.js";
import { keyPairFromPrivateKey } from "./crypto.js";
const privateKey = "1".repeat(64);
const address = keyPairFromPrivateKey(privateKey).address;
const derive = (key: string) => keyPairFromPrivateKey(key).address;
describe("public genesis identity", () => {
  test("public follower and private faucet resolve the same address", () => {
    expect(resolveFaucetIdentity({ GENESIS_FAUCET_ADDRESS: address }, derive)).toEqual({ privateKey: "", address });
    expect(resolveFaucetIdentity({ DEV_FAUCET_PRIVATE_KEY: privateKey }, derive).address).toBe(address);
  });
  test("rejects conflicting identities", () => {
    expect(() => resolveFaucetIdentity({ DEV_FAUCET_PRIVATE_KEY: privateKey, GENESIS_FAUCET_ADDRESS: "0x" + "0".repeat(40) }, derive)).toThrow("does not match");
  });
  test("normalizes matching public addresses", () => {
    expect(resolveFaucetIdentity({ DEV_FAUCET_PRIVATE_KEY: privateKey, GENESIS_FAUCET_ADDRESS: address.toUpperCase() }, derive).address).toBe(address);
  });
  test("fails closed for missing or malformed configuration", () => {
    for (const env of [{}, { GENESIS_FAUCET_ADDRESS: "wrong" }, { DEV_FAUCET_PRIVATE_KEY: "invalid", GENESIS_FAUCET_ADDRESS: address }, { DEV_FAUCET_PRIVATE_KEY: "0".repeat(64) }]) expect(() => resolveFaucetIdentity(env, derive)).toThrow();
  });
});
