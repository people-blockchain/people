import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GetPublicKeyCommand,
  SignCommand,
} from "@aws-sdk/client-kms";
import {
  bytesToHex,
  concat,
  hexToBytes,
  keccak256,
  parseSignature,
  recoverTypedDataAddress,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  VERIFICATION_TYPEHASH,
  VERIFICATION_TYPES,
  buildVerificationDomain,
  verificationDigest,
} from "../src/lib/sale/verifier/typed-data.ts";
import { createLocalVerifierSigner } from "../src/lib/sale/verifier/local.ts";
import {
  SECP256K1_HALF_N,
  SECP256K1_N,
  createKmsVerifierSigner,
  normalizeS,
  parseDerSignature,
} from "../src/lib/sale/verifier/kms-aws.ts";

const HUB = "0x3333333333333333333333333333333333333333";
const CHAIN_ID = 84532;
const KEY = `0x${"1".repeat(64)}`;
const OTHER_KEY = `0x${"2".repeat(64)}`;
const ACCOUNT = privateKeyToAccount(KEY);
const TYPE_STRING = "Verification(address account,bytes32 personId,uint256 nonce,uint256 deadline)";

const MESSAGE = {
  account: ACCOUNT.address,
  personId: keccak256(toBytes("sale-person-1")),
  nonce: 0n,
  deadline: 1_800_000_000n,
};

const DOMAIN = buildVerificationDomain({ chainId: CHAIN_ID, hub: HUB });

/** SPKI header for a secp256k1 SubjectPublicKeyInfo followed by the uncompressed point. */
const SPKI_PREFIX = "0x3056301006072a8648ce3d020106052b8104000a034200";

function derInteger(value) {
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let bytes = hexToBytes(`0x${hex}`);
  if (bytes[0] & 0x80) bytes = concat([new Uint8Array([0]), bytes]);
  return concat([new Uint8Array([0x02, bytes.length]), bytes]);
}

function derSignature(r, s) {
  const body = concat([derInteger(r), derInteger(s)]);
  return concat([new Uint8Array([0x30, body.length]), body]);
}

/** Fake KMS backed by a local secp256k1 account; can deliberately return a high-s DER sig. */
function makeFakeKms(account, { highS = false, signer = account } = {}) {
  const spki = concat([hexToBytes(SPKI_PREFIX), hexToBytes(account.publicKey)]);
  return {
    async send(command) {
      if (command instanceof GetPublicKeyCommand) return { PublicKey: spki };
      if (command instanceof SignCommand) {
        const hash = bytesToHex(command.input.Message);
        const signed = await signer.sign({ hash });
        const parsed = parseSignature(signed);
        const r = BigInt(parsed.r);
        const lowS = BigInt(parsed.s);
        const s = highS ? SECP256K1_N - lowS : lowS;
        return { Signature: derSignature(r, s) };
      }
      throw new Error("unexpected KMS command");
    },
  };
}

test("domain is exactly PplCurveHubV2 / 1 / chainId / hub", () => {
  assert.deepEqual(DOMAIN, {
    name: "PplCurveHubV2",
    version: "1",
    chainId: 84532,
    verifyingContract: HUB,
  });
});

test("VERIFICATION_TYPEHASH is keccak256 of the exact struct string", () => {
  assert.equal(VERIFICATION_TYPEHASH, keccak256(toBytes(TYPE_STRING)));
});

test("local signer recovers to its own address via recoverTypedDataAddress", async () => {
  const signer = createLocalVerifierSigner(CHAIN_ID, KEY);
  assert.equal(await signer.getAddress(), ACCOUNT.address);

  const signature = await signer.signDigest(
    verificationDigest({ chainId: CHAIN_ID, hub: HUB, message: MESSAGE }),
  );
  const recovered = await recoverTypedDataAddress({
    domain: DOMAIN,
    types: VERIFICATION_TYPES,
    primaryType: "Verification",
    message: MESSAGE,
    signature,
  });
  assert.equal(recovered, ACCOUNT.address);
});

test("local signer refuses Base mainnet (8453)", () => {
  assert.throws(() => createLocalVerifierSigner(8453, KEY), /Base Sepolia/);
});

test("local signer refuses Ethereum mainnet (1)", () => {
  assert.throws(() => createLocalVerifierSigner(1, KEY), /Base Sepolia/);
});

test("KMS adapter parses DER, normalizes s, finds v, and recovers to the KMS address", async () => {
  const signer = createKmsVerifierSigner({ client: makeFakeKms(ACCOUNT), keyId: "test-key" });
  assert.equal(await signer.getAddress(), ACCOUNT.address);

  const digest = verificationDigest({ chainId: CHAIN_ID, hub: HUB, message: MESSAGE });
  const signature = await signer.signDigest(digest);

  const parsed = parseSignature(signature);
  assert.ok(BigInt(parsed.s) <= SECP256K1_HALF_N);

  const recovered = await recoverTypedDataAddress({
    domain: DOMAIN,
    types: VERIFICATION_TYPES,
    primaryType: "Verification",
    message: MESSAGE,
    signature,
  });
  assert.equal(recovered, ACCOUNT.address);
});

test("KMS adapter normalizes a high-s DER signature to low-s", async () => {
  const signer = createKmsVerifierSigner({
    client: makeFakeKms(ACCOUNT, { highS: true }),
    keyId: "test-key",
  });
  const digest = verificationDigest({ chainId: CHAIN_ID, hub: HUB, message: MESSAGE });
  const signature = await signer.signDigest(digest);

  const parsed = parseSignature(signature);
  assert.ok(BigInt(parsed.s) <= SECP256K1_HALF_N);
  assert.equal(normalizeS(SECP256K1_N - BigInt(parsed.s)), BigInt(parsed.s));

  const recovered = await recoverTypedDataAddress({
    domain: DOMAIN,
    types: VERIFICATION_TYPES,
    primaryType: "Verification",
    message: MESSAGE,
    signature,
  });
  assert.equal(recovered, ACCOUNT.address);
});

test("KMS adapter rejects a signature that does not recover to its public key", async () => {
  const signer = createKmsVerifierSigner({
    client: makeFakeKms(ACCOUNT, { signer: privateKeyToAccount(OTHER_KEY) }),
    keyId: "test-key",
  });
  assert.equal(await signer.getAddress(), ACCOUNT.address);
  const digest = verificationDigest({ chainId: CHAIN_ID, hub: HUB, message: MESSAGE });
  await assert.rejects(() => signer.signDigest(digest), /does not recover/);
});

test("parseDerSignature round-trips r and s", () => {
  const r = SECP256K1_N - 123n;
  const s = 456n;
  const parsed = parseDerSignature(derSignature(r, s));
  assert.equal(parsed.r, r);
  assert.equal(parsed.s, s);
});
