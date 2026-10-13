import { randomBytes } from "node:crypto";

if (!process.env.DEV_FAUCET_PRIVATE_KEY?.trim()) {
  process.env.DEV_FAUCET_PRIVATE_KEY = randomBytes(32).toString("hex");
}

import { getPublicKey, etc } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
process.env.BOOTSTRAP_PRIVATE_KEY ??= randomBytes(32).toString("hex");
process.env.BOOTSTRAP_ADDRESS = "0x" + etc.bytesToHex(sha256(getPublicKey(etc.hexToBytes(process.env.BOOTSTRAP_PRIVATE_KEY),true))).slice(0,40);
