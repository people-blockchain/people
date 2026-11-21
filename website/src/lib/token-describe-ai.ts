/**
 * Cloudflare Workers AI — natural language → strict JSON for token launch fields.
 */

import { isCloudflareFluxConfigured } from "@/lib/flux-generate";

export type TokenDescribeModelJson = {
  name: string;
  symbol: string;
  supply: string;
  rationale: string;
};

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

const SCHEMA_HINT = `Return ONLY valid JSON with keys: name (string, 2-32 chars), symbol (string, 2-8 uppercase A-Z0-9), supply (string, whole tokens integer, min 1000000, no decimals), rationale (string, 1-3 short honest sentences in the same language as the user).`;

export function isTokenDescribeAiConfigured(): boolean {
  return isCloudflareFluxConfigured();
}

export async function parseTokenDescriptionWithAi(
  description: string,
  lang: string,
): Promise<TokenDescribeModelJson | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) return null;

  const system = [
    "You help people draft community token launches on PEOPLE Blockchain.",
    "You NEVER promise fundraising outcomes, guaranteed revenue, or dollar raises.",
    "Community token start price is NOT chosen by the user; it follows a bonding curve formula (60 PPL virtual reserve / curve allocation).",
    "If the user asks for a dollar price per token, pick a supply that makes the formula spot close and explain they cannot set USD directly.",
    "Do not confuse PPL sale curve ($0.005) with community token curves.",
    `Write rationale in language code: ${lang}.`,
    SCHEMA_HINT,
  ].join(" ");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: description.slice(0, 4000) },
        ],
        max_tokens: 512,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(25_000),
    },
  );

  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    result?: { response?: string };
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || !body.success) {
    console.warn("[token-describe-ai] cf error", body.errors?.[0]?.message ?? res.status);
    return null;
  }
  const raw = body.result?.response?.trim();
  if (!raw) return null;
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as TokenDescribeModelJson;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}