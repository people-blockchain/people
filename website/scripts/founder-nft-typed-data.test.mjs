import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, keccak256, recoverTypedDataAddress, toBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  FOUNDER_NFT_DOMAIN_NAME,
  FOUNDER_NFT_DOMAIN_VERSION,
  FOUNDER_NFT_MINT_TYPES,
  FOUNDER_NFT_REBIND_TYPES,
  founderNftDomain,
  signFounderNftMint,
  signFounderNftRebind,
} from "../src/lib/founders/founder-nft-typed-data.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sol = readFileSync(join(root, "../contracts/src/nft/PeopleFounderNFT.sol"), "utf8");
const config = { address: getAddress("0x0000000000000000000000000000000000000004"), chainId: 97401 };
const personId = `0x${"ab".repeat(32)}`;
const to = getAddress("0x0000000000000000000000000000000000000005");
const oldHolder = getAddress("0x0000000000000000000000000000000000000006");
const nonce = 11n;
const deadline = 1_800_000_000n;

function structString(primary, fields) {
  return `${primary}(${fields.map((field) => `${field.type} ${field.name}`).join(",")})`;
}

test("Mint and Rebind type strings match the contract typehashes", () => {
  const mint = structString("Mint", FOUNDER_NFT_MINT_TYPES.Mint);
  const rebind = structString("Rebind", FOUNDER_NFT_REBIND_TYPES.Rebind);
  assert.equal(mint, "Mint(bytes32 personId,address to,uint256 nonce,uint256 deadline)");
  assert.equal(rebind, "Rebind(bytes32 personId,address oldHolder,address newHolder,uint256 nonce,uint256 deadline)");
  assert.match(sol, new RegExp(`keccak256\\("${mint.replace(/[()]/g, "\\$&")}"\\)`));
  assert.match(sol, new RegExp(`keccak256\\("${rebind.replace(/[()]/g, "\\$&")}"\\)`));
  assert.equal(keccak256(toBytes(mint)), keccak256(toBytes("Mint(bytes32 personId,address to,uint256 nonce,uint256 deadline)")));
});

test("domain name and version match the contract EIP-712 domain", () => {
  assert.equal(FOUNDER_NFT_DOMAIN_NAME, "PeopleFounderNFT");
  assert.equal(FOUNDER_NFT_DOMAIN_VERSION, "1");
  assert.match(sol, /EIP712\("PeopleFounderNFT", "1"\)/);
  assert.deepEqual(founderNftDomain(config), {
    name: "PeopleFounderNFT",
    version: "1",
    chainId: 97401,
    verifyingContract: config.address,
  });
});

test("a generated test key signs Mint and Rebind typed data that recover to it", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const mintSignature = await signFounderNftMint(account, config, { personId, to, nonce, deadline });
  const rebindSignature = await signFounderNftRebind(account, config, {
    personId,
    oldHolder,
    newHolder: to,
    nonce,
    deadline,
  });
  assert.equal(
    await recoverTypedDataAddress({
      domain: founderNftDomain(config),
      types: FOUNDER_NFT_MINT_TYPES,
      primaryType: "Mint",
      message: { personId, to, nonce, deadline },
      signature: mintSignature,
    }),
    account.address,
  );
  assert.equal(
    await recoverTypedDataAddress({
      domain: founderNftDomain(config),
      types: FOUNDER_NFT_REBIND_TYPES,
      primaryType: "Rebind",
      message: { personId, oldHolder, newHolder: to, nonce, deadline },
      signature: rebindSignature,
    }),
    account.address,
  );
});
