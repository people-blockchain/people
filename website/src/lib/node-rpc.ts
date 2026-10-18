/**
 * Public testnet node defaults when env is unset. Env vars still override.
 */

import { readPublicChainBackend } from "@/lib/chain-mode";
import { readEvmRpcUrl } from "@/lib/evm/config";
import { readEnvWithLegacy } from "@/lib/legacy-env";

export const DEFAULT_PUBLIC_NODE_URL = "https://node.peopleblockchain.network";
export const DEFAULT_PUBLIC_CHAIN_ID = "people-public-testnet-v2-2026-09-30";
export const COSMOS_EVM_CHAIN_ID_LABEL = "97401";

export function readOptionalUrl(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Server-side node HTTP origin (no trailing slash). */
export function resolveNodeRpcUrl(): string {
  return (
    readOptionalUrl(readEnvWithLegacy(process.env.PEOPLE_RPC_URL, process.env.OVN_RPC_URL)) ??
    readOptionalUrl(
      readEnvWithLegacy(process.env.NEXT_PUBLIC_PEOPLE_RPC_URL, process.env.NEXT_PUBLIC_OVN_RPC_URL),
    ) ??
    readOptionalUrl(readEnvWithLegacy(process.env.PEOPLE_NODE_URL, process.env.OVN_NODE_URL)) ??
    DEFAULT_PUBLIC_NODE_URL
  );
}

export function resolvePublicChainId(): string {
  if (readPublicChainBackend() === "cosmos-evm") return COSMOS_EVM_CHAIN_ID_LABEL;
  const fromEnv = process.env.NEXT_PUBLIC_CHAIN_ID?.trim();
  return fromEnv || DEFAULT_PUBLIC_CHAIN_ID;
}

/** Public browser WebSocket endpoint; never forward RPC credentials. */
export function resolveNodeWebSocketUrl(): string {
  if (readPublicChainBackend() === "cosmos-evm") {
    const url = new URL(process.env.EVM_WS_URL?.trim() || readEvmRpcUrl());
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("Node WebSocket URL must not contain credentials, query or fragment");
    }
    if (!process.env.EVM_WS_URL?.trim()) url.pathname = "/ws";
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) throw new Error("Invalid WebSocket protocol");
    url.protocol = ["https:", "wss:"].includes(url.protocol) ? "wss:" : "ws:";
    return url.toString();
  }
  const explicit = readEnvWithLegacy(process.env.PEOPLE_WS_URL, process.env.OVN_WS_URL);
  const url = new URL(explicit || resolveNodeRpcUrl());
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Node WebSocket URL must not contain credentials, query or fragment");
  }
  if (!explicit) {
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/$/, "")}/ws`;
  }
  if (!["ws:", "wss:"].includes(url.protocol)) throw new Error("Invalid WebSocket protocol");
  return url.toString();
}
