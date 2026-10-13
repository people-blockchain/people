import { isCosmosEvmChain } from "@/lib/chain-mode";
import { networkJson } from "@/lib/network-client";

export async function requestTestnetFaucet(address: string, amount: string | number): Promise<void> {
  const body = { address, amount: String(amount) };
  if (isCosmosEvmChain()) {
    const res = await fetch("/api/evm/faucet/fund", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await res.json()) as { ok?: boolean; error?: string; message?: string };
    if (!payload.ok && !res.ok) throw new Error(payload.message ?? payload.error ?? "faucet");
    return;
  }
  await networkJson("faucet/fund", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
