/**
 * FLUX.1 [schnell] image generation for factory icons.
 * Provider order: Cloudflare Workers AI (free neurons) → Pollinations (keyless) → Together (optional).
 */

const ICON_GEN_IMAGE_SIZE = 512;

export type FluxProviderId = "cloudflare" | "pollinations" | "together";

export function isCloudflareFluxConfigured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN?.trim()
  );
}

export function isTogetherFluxConfigured(): boolean {
  return Boolean(process.env.TOGETHER_API_KEY?.trim());
}

export function isPollinationsKeylessEnabled(): boolean {
  return (process.env.ICON_GEN_POLLINATIONS_FALLBACK ?? "1").trim() !== "0";
}

/** Which backend will run for the current env (null = icon gen unavailable). */
export function resolveFluxProvider(): FluxProviderId | null {
  if (isCloudflareFluxConfigured()) return "cloudflare";
  if (isPollinationsKeylessEnabled()) return "pollinations";
  if (isTogetherFluxConfigured()) return "together";
  return null;
}

/** Delay between variant requests when using anonymous Pollinations (15s/IP guidance). */
export function variantDelayMsForProvider(provider: FluxProviderId): number {
  return provider === "pollinations" ? 16_000 : 0;
}

export async function generateFluxSchnellPng(
  prompt: string,
  seed?: number,
  providerOverride?: FluxProviderId
): Promise<Uint8Array> {
  const provider = providerOverride ?? resolveFluxProvider();
  if (!provider) {
    throw new Error("flux_not_configured");
  }
  switch (provider) {
    case "cloudflare":
      return generateViaCloudflare(prompt);
    case "pollinations":
      return generateViaPollinations(prompt, seed);
    case "together":
      return generateViaTogether(prompt, seed);
    default:
      throw new Error("flux_not_configured");
  }
}

async function generateViaCloudflare(prompt: string): Promise<Uint8Array> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) {
    throw new Error("cloudflare_not_configured");
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        steps: 4,
      }),
    }
  );
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    result?: { image?: string };
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || !body.success || !body.result?.image) {
    const msg = body.errors?.[0]?.message ?? "cloudflare_generation_failed";
    throw new Error(msg);
  }
  return Uint8Array.from(Buffer.from(body.result.image, "base64"));
}

async function generateViaPollinations(prompt: string, seed?: number): Promise<Uint8Array> {
  const params = new URLSearchParams({
    model: "flux",
    width: String(ICON_GEN_IMAGE_SIZE),
    height: String(ICON_GEN_IMAGE_SIZE),
    nologo: "true",
    private: "true",
  });
  if (seed !== undefined) {
    params.set("seed", String(seed));
  }
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
  const res = await fetch(url, {
    headers: { Accept: "image/*", "User-Agent": "PeopleBlockchain-Factory/1.0" },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    throw new Error("pollinations_generation_failed");
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function generateViaTogether(prompt: string, seed?: number): Promise<Uint8Array> {
  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("together_not_configured");
  }
  const res = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "black-forest-labs/FLUX.1-schnell",
      prompt,
      width: ICON_GEN_IMAGE_SIZE,
      height: ICON_GEN_IMAGE_SIZE,
      steps: 4,
      n: 1,
      response_format: "base64",
      ...(seed !== undefined ? { seed } : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(body.error?.message ?? "together_generation_failed");
  }
  const item = body.data?.[0];
  if (item?.b64_json) {
    return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
  }
  if (item?.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new Error("together_fetch_failed");
    return new Uint8Array(await img.arrayBuffer());
  }
  throw new Error("together_empty_response");
}
