import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { readEvmRpcUrl } from "@/lib/evm/config";
import { createFounderNftChainReader, createFounderNftViemClient } from "./founder-nft-chain";
import { readFounderNftPublicConfig, readFounderNftSignerAccount } from "./founder-nft-config";
import {
  fetchHumanPassportStampNullifiers,
  findFounderNftPerson,
  resolveFounderNftPerson,
} from "./founder-nft-person";
import type { FounderNftError, FounderNftServiceDeps } from "./founder-nft-service";
import { getFounderByUserId } from "./service";

/** Production wiring of the Founder NFT service (database, Stamps API, chain RPC, env). */
export function founderNftServiceDeps(): FounderNftServiceDeps {
  return {
    readConfig: () => readFounderNftPublicConfig(),
    readSigner: () => readFounderNftSignerAccount(),
    loadFounder: (userId) => getFounderByUserId(userId),
    fetchNullifiers: (walletAddress) => fetchHumanPassportStampNullifiers({ walletAddress, fetch }),
    findPerson: findFounderNftPerson,
    resolvePerson: resolveFounderNftPerson,
    chain: (config) => createFounderNftChainReader(createFounderNftViemClient(config, readEvmRpcUrl()), config),
    now: () => Math.floor(Date.now() / 1000),
    randomNonce: () => BigInt(`0x${randomBytes(16).toString("hex")}`),
  };
}

export function founderNftErrorResponse(error: FounderNftError): NextResponse {
  return NextResponse.json(
    { error: error.error, ...(error.reason ? { reason: error.reason } : {}), ...(error.state ? { state: error.state } : {}) },
    { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
