/**
 * Cloudflare Workers AI — untrusted user text → JSON object. Token stays server-side.
 */

import { isCloudflareFluxConfigured } from "@/lib/flux-generate";
import type { DescribeHelperLang } from "@/lib/describe-helper-lang";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

export function isDescribeHelperAiConfigured(): boolean {
  return isCloudflareFluxConfigured();
}

export async function runDescribeHelperAi(
  system: string,
  user: string,
  lang: DescribeHelperLang,
): Promise<Record<string, unknown> | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) return null;

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
          { role: "system", content: `${system} Write rationale in language code: ${lang}.` },
          { role: "user", content: user.slice(0, 4000) },
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
    console.warn("[describe-helper-ai] cf error", body.errors?.[0]?.message ?? res.status);
    return null;
  }
  const raw = body.result?.response?.trim();
  if (!raw) return null;
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
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
