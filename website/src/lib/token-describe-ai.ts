/**
 * Cloudflare Workers AI — natural language → strict JSON for token launch fields.
 */

import { allowlistDescribeLang, type DescribeHelperLang } from "@/lib/describe-helper-lang";
import { isDescribeHelperAiConfigured, runDescribeHelperAi } from "@/lib/describe-helper-ai";

export type TokenDescribeModelJson = {
  name: string;
  symbol: string;
  supply: string;
  rationale: string;
};

const SCHEMA_HINT = `Return ONLY valid JSON with keys: name (string, 2-32 chars), symbol (string, 2-8 uppercase A-Z0-9), supply (string, whole tokens integer, min 1000000, no decimals), rationale (string, 1-3 short honest sentences in the same language as the user).`;

export function isTokenDescribeAiConfigured(): boolean {
  return isDescribeHelperAiConfigured();
}

export async function parseTokenDescriptionWithAi(
  description: string,
  lang: string,
): Promise<TokenDescribeModelJson | null> {
  const safeLang: DescribeHelperLang = allowlistDescribeLang(lang);
  const system = [
    "You help people draft community token launches on PEOPLE Blockchain.",
    "You NEVER promise fundraising outcomes, guaranteed revenue, or dollar raises.",
    "Community token start price is NOT chosen by the user; it follows a bonding curve formula (60 PPL virtual reserve / curve allocation).",
    "If the user asks for a dollar price per token, pick a supply that makes the formula spot close and explain they cannot set USD directly.",
    "Do not confuse PPL sale curve ($0.005) with community token curves.",
    SCHEMA_HINT,
  ].join(" ");

  const parsed = await runDescribeHelperAi(system, description, safeLang);
  if (!parsed) return null;
  return parsed as TokenDescribeModelJson;
}
