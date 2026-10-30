import type { TokenMetadata, TokenMetadataInput } from "./factory/token-metadata.ts";

/** Browser half of the token metadata pin: POSTs the fields and returns the `ipfs://<CID>/metadata.json` URI. */
export async function pinTokenMetadata(
  input: TokenMetadataInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ uri: string; json?: TokenMetadata }> {
  const res = await fetchImpl("/api/factory/token/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      symbol: input.symbol,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.image ? { image: input.image } : {}),
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as { tokenUri?: unknown; json?: TokenMetadata; error?: unknown };
  if (!res.ok) throw new Error(typeof payload.error === "string" ? payload.error : `http_${res.status}`);
  if (typeof payload.tokenUri !== "string") throw new Error("invalid_pin_response");
  return { uri: payload.tokenUri, json: payload.json };
}
