import { allowlistDescribeLang } from "@/lib/describe-helper-lang";
import { runDescribeHelperAi } from "@/lib/describe-helper-ai";
import { isHexAddress } from "@/lib/describe-helper-kinds";
import {
  CONTRACT_TEMPLATES,
  findTemplateById,
  matchTemplate,
  type ContractTemplateId,
} from "@/lib/contract-templates";

export type ContractDescribeResult = {
  templateId: ContractTemplateId;
  title: string;
  prompt: string;
  params: Record<string, string>;
  rationale: string;
  source: "ai" | "heuristic";
  warnings: string[];
};

const TEMPLATE_IDS = CONTRACT_TEMPLATES.map((t) => t.id).join(", ");

const PARAM_KEYS = [
  "token_",
  "stakingToken_",
  "rewardToken_",
  "beneficiary_",
  "seller_",
  "owners_",
  "threshold_",
  "duration_",
  "total_",
  "quorum_",
  "votingPeriod_",
  "timeout_",
  "delay_",
] as const;

function asString(raw: unknown): string {
  return typeof raw === "string" ? raw : raw == null ? "" : String(raw);
}

function normalizeAddress(value: string): string {
  const v = value.trim();
  return isHexAddress(v) ? v : "";
}

function normalizeUint(value: string, min: bigint, max: bigint): string {
  const clean = value.trim().replace(/[_\s,]/g, "");
  if (!/^\d+$/.test(clean)) return "";
  try {
    const n = BigInt(clean);
    if (n < min || n > max) return "";
    return n.toString();
  } catch {
    return "";
  }
}

function normalizeDays(value: string): string {
  return normalizeUint(value, BigInt(1), BigInt(3650));
}

function normalizeHours(value: string): string {
  return normalizeUint(value, BigInt(1), BigInt(24 * 365));
}

function normalizeCount(value: string): string {
  return normalizeUint(value, BigInt(1), BigInt(1000));
}

function normalizeOwners(value: string): string {
  const parts = value
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter(isHexAddress);
  return parts.slice(0, 20).join("\n");
}

export function normalizeContractDescribeFields(
  raw: Record<string, unknown>,
  fallbackPrompt: string,
): Omit<ContractDescribeResult, "source" | "warnings"> | null {
  const template = findTemplateById(asString(raw.templateId).trim());
  if (!template) return null;
  const rawParams =
    raw.params && typeof raw.params === "object" && !Array.isArray(raw.params)
      ? (raw.params as Record<string, unknown>)
      : {};
  const params: Record<string, string> = {};
  for (const key of PARAM_KEYS) {
    const value = asString(rawParams[key]).trim();
    if (!value) continue;
    if (key === "owners_") {
      const owners = normalizeOwners(value);
      if (owners) params[key] = owners;
      continue;
    }
    if (key.endsWith("Token_") || key === "token_" || key === "beneficiary_" || key === "seller_") {
      const addr = normalizeAddress(value);
      if (addr) params[key] = addr;
      continue;
    }
    if (key === "duration_" || key === "votingPeriod_" || key === "timeout_") {
      const days = normalizeDays(value);
      if (days) params[key] = days;
      continue;
    }
    if (key === "delay_") {
      const hours = normalizeHours(value);
      if (hours) params[key] = hours;
      continue;
    }
    if (key === "threshold_") {
      const count = normalizeCount(value);
      if (count) params[key] = count;
      continue;
    }
    if (key === "total_" || key === "quorum_") {
      const amt = normalizeUint(value, BigInt(1), BigInt(10) ** BigInt(30));
      if (amt) params[key] = amt;
    }
  }
  const rationale = asString(raw.rationale).trim().slice(0, 600);
  const prompt = asString(raw.prompt).trim().slice(0, 4000) || fallbackPrompt.slice(0, 4000);
  return {
    templateId: template.id,
    title: template.titleEn,
    prompt,
    params,
    rationale,
  };
}

function heuristicParams(prompt: string): Record<string, string> {
  const addresses = prompt.match(/0x[a-fA-F0-9]{40}/g) ?? [];
  const params: Record<string, string> = {};
  if (addresses[0]) params.token_ = addresses[0];
  if (addresses[1]) params.beneficiary_ = addresses[1];
  const days = prompt.match(/\b(\d{1,4})\s*(day|days)\b/i);
  if (days) params.duration_ = days[1]!;
  return params;
}

export function parseContractDescriptionHeuristic(description: string): ContractDescribeResult | null {
  const text = description.trim();
  if (text.length < 8) return null;
  const template = matchTemplate(text);
  return {
    templateId: template.id,
    title: template.titleEn,
    prompt: text.slice(0, 4000),
    params: heuristicParams(text),
    rationale: "",
    source: "heuristic",
    warnings: [],
  };
}

export async function parseContractDescription(
  description: string,
  lang: string,
): Promise<ContractDescribeResult | null> {
  const aiLang = allowlistDescribeLang(lang);
  const catalog = CONTRACT_TEMPLATES.map((t) => `${t.id}: ${t.titleEn}`).join("; ");
  const ai = await runDescribeHelperAi(
    [
      "You help people fill the PEOPLE contract wizard. Pick exactly one reviewed template.",
      `Allowed templateId values: ${TEMPLATE_IDS}.`,
      `Catalog: ${catalog}.`,
      "Return ONLY JSON {templateId, prompt, params, rationale}. params may include constructor keys token_, stakingToken_, rewardToken_, beneficiary_, seller_, owners_, threshold_, duration_ (days), total_, quorum_, votingPeriod_ (days), timeout_ (days), delay_ (hours).",
      "Never invent Solidity, never deploy, never request a signature.",
    ].join(" "),
    description,
    aiLang,
  );
  if (ai) {
    const fields = normalizeContractDescribeFields(ai, description);
    if (fields) return { ...fields, source: "ai", warnings: [] };
  }
  return parseContractDescriptionHeuristic(description);
}
