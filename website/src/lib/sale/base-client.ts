"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import type { ActiveEvmSigner } from "@/context/ExternalWalletContext";
import { normalizePrivateKey, type EIP1193Provider } from "@/lib/evm/client";
import { SALE_HUB_CHAIN } from "@/lib/sale/config";

function baseRpcUrl(): string {
  return SALE_HUB_CHAIN.rpcUrl;
}

let cachedPublicClient: ReturnType<typeof buildBasePublicClient> | null = null;

function buildBasePublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(baseRpcUrl()),
  });
}

/** Shared read client for Base (one instance per page load). */
export function createBasePublicClient() {
  cachedPublicClient ??= buildBasePublicClient();
  return cachedPublicClient;
}

export function createBaseWalletClientFromKey(privateKey: string) {
  const account = privateKeyToAccount(normalizePrivateKey(privateKey));
  return createWalletClient({
    chain: base,
    transport: http(baseRpcUrl()),
    account,
  });
}

export function createBaseWalletClientFromProvider(provider: EIP1193Provider, address: Address) {
  return createWalletClient({
    chain: base,
    transport: custom(provider),
    account: address,
  });
}

/** Switch the injected wallet to Base mainnet (chain id 8453). */
export async function ensureBaseChain(provider: EIP1193Provider): Promise<void> {
  const hexId = `0x${SALE_HUB_CHAIN.chainId.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
    return;
  } catch (err) {
    if ((err as { code?: number })?.code === 4001) throw err;
  }
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: hexId,
        chainName: "Base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: [baseRpcUrl()],
      },
    ],
  });
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: hexId }],
  });
}

export type BaseWriteSigner =
  | { kind: "embedded"; privateKey: string; address: Address }
  | { kind: "injected"; provider: NonNullable<ActiveEvmSigner["provider"]>; address: Address };

export async function writeOnBase(
  signer: BaseWriteSigner,
  request: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  },
): Promise<Hex> {
  if (signer.kind === "embedded") {
    const client = createBaseWalletClientFromKey(signer.privateKey);
    return client.writeContract({
      chain: base,
      address: request.address,
      abi: request.abi,
      functionName: request.functionName,
      args: request.args as never,
    });
  }
  await ensureBaseChain(signer.provider);
  const client = createBaseWalletClientFromProvider(signer.provider, signer.address);
  return client.writeContract({
    chain: base,
    address: request.address,
    abi: request.abi,
    functionName: request.functionName,
    args: request.args as never,
    account: signer.address,
  });
}

/**
 * Sends a transaction and resolves only once it is mined. Throws if the
 * receipt says it reverted, so a failed approve can never be followed by a buy.
 */
export async function writeOnBaseAndWait(
  signer: BaseWriteSigner,
  request: Parameters<typeof writeOnBase>[1],
): Promise<Hex> {
  const hash = await writeOnBase(signer, request);
  const receipt = await createBasePublicClient().waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("tx_failed");
  return hash;
}
