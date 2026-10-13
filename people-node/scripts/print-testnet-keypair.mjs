#!/usr/bin/env node
/**
 * Print a fresh secp256k1 keypair in the format this node uses.
 * Run locally. Never commit the private key.
 *
 *   node scripts/print-testnet-keypair.mjs
 */
import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const { bytesToHex, hexToBytes } = secp.etc;
const privateKey = bytesToHex(secp.utils.randomSecretKey());
const publicKey = bytesToHex(secp.getPublicKey(hexToBytes(privateKey), true));
const address = `0x${bytesToHex(sha256(hexToBytes(publicKey))).slice(0, 40)}`;

process.stdout.write(
  [
    "TESTNET KEYPAIR — do not commit, do not use on mainnet",
    `VALIDATOR_PRIVATE_KEY=${privateKey}`,
    `VALIDATOR_ADDRESS=${address}`,
    `DEV_FAUCET_PRIVATE_KEY=${privateKey}`,
    "(Use a different faucet key than the validator key in production-like testnet.)",
    ""
  ].join("\n")
);
