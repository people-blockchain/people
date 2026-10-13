/** Browser client for the public node, via same-origin `/api/network` proxy. */

import { DEFAULT_TRANSFER_FEE_PPL } from "@/lib/factory-fees";
import { isCosmosEvmChain } from "@/lib/chain-mode";

export const DEFAULT_TRANSFER_FEE = DEFAULT_TRANSFER_FEE_PPL;

export async function networkFetch(path: string, init?: RequestInit): Promise<Response> {
  const trimmed = path.replace(/^\//, "");
  if (isCosmosEvmChain()) {
    return fetch(`/api/evm/compat/${trimmed}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }
  return fetch(`/api/network/${trimmed}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function networkJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await networkFetch(path, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `http_${res.status}`);
  }
  return body;
}

export type NetworkHealth = {
  status?: string;
  chainId?: string;
  height?: number;
};

export async function fetchHealth(): Promise<NetworkHealth | null> {
  try {
    return await networkJson<NetworkHealth>("health");
  } catch {
    return null;
  }
}
