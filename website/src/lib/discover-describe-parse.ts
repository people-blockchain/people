import { DISCOVER_FIELD_LIMITS } from "@/lib/discover/field-limits";
import { allowlistDescribeLang } from "@/lib/describe-helper-lang";
import { runDescribeHelperAi } from "@/lib/describe-helper-ai";

export type DiscoverDescribeResult = {
  title: string;
  idea: string;
  audience: string;
  whyToken: string;
  productUrl: string;
  rationale: string;
  source: "ai" | "heuristic";
  warnings: string[];
};

function asString(raw: unknown): string {
  return typeof raw === "string" ? raw : raw == null ? "" : String(raw);
}

function clip(value: string, max: number): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

function normalizeHttpsUrl(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (v.length > DISCOVER_FIELD_LIMITS.url) return "";
  try {
    const url = new URL(v);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeDiscoverDescribeFields(
  raw: Record<string, unknown>,
): Omit<DiscoverDescribeResult, "source" | "warnings"> | null {
  const title = clip(asString(raw.title), DISCOVER_FIELD_LIMITS.title);
  const idea = clip(asString(raw.idea), DISCOVER_FIELD_LIMITS.idea);
  const audience = clip(asString(raw.audience), DISCOVER_FIELD_LIMITS.audience);
  const whyToken = clip(asString(raw.whyToken), DISCOVER_FIELD_LIMITS.whyToken);
  if (title.length < 2 || idea.length < 8 || audience.length < 4 || whyToken.length < 4) return null;
  return {
    title,
    idea,
    audience,
    whyToken,
    productUrl: normalizeHttpsUrl(asString(raw.productUrl)),
    rationale: clip(asString(raw.rationale), 600),
  };
}

function firstSentence(text: string, max: number): string {
  const cut = text.split(/[.!?\n]/)[0]?.trim() || text.trim();
  return clip(cut, max) || text.slice(0, max);
}

export function parseDiscoverDescriptionHeuristic(description: string): DiscoverDescribeResult | null {
  const text = description.trim();
  if (text.length < 8) return null;
  const title = firstSentence(text, DISCOVER_FIELD_LIMITS.title);
  return {
    title: title.length >= 2 ? title : "Community project",
    idea: clip(text, DISCOVER_FIELD_LIMITS.idea),
    audience: "People who care about this community.",
    whyToken: "A community token coordinates support and membership on PEOPLE.",
    productUrl: "",
    rationale: "",
    source: "heuristic",
    warnings: [],
  };
}

export async function parseDiscoverDescription(
  description: string,
  lang: string,
): Promise<DiscoverDescribeResult | null> {
  const aiLang = allowlistDescribeLang(lang);
  const ai = await runDescribeHelperAi(
    [
      "You help people fill a PEOPLE Discover project card.",
      "Return ONLY JSON {title, idea, audience, whyToken, productUrl, rationale}.",
      `Limits: title ${DISCOVER_FIELD_LIMITS.title}, idea ${DISCOVER_FIELD_LIMITS.idea}, audience ${DISCOVER_FIELD_LIMITS.audience}, whyToken ${DISCOVER_FIELD_LIMITS.whyToken}. productUrl must be https or empty.`,
      "Never submit the project. Never invent video or screenshot URLs.",
    ].join(" "),
    description,
    aiLang,
  );
  if (ai) {
    const fields = normalizeDiscoverDescribeFields(ai);
    if (fields) return { ...fields, source: "ai", warnings: [] };
  }
  return parseDiscoverDescriptionHeuristic(description);
}
