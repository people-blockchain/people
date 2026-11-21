import { NFT_DESCRIPTION_MAX, NFT_NAME_MAX, NFT_NAME_MIN, cleanNftText } from "@/lib/nft-media-rules";
import { allowlistDescribeLang } from "@/lib/describe-helper-lang";
import { runDescribeHelperAi } from "@/lib/describe-helper-ai";
import { isHexAddress } from "@/lib/describe-helper-kinds";

export type NftMintMode = "single" | "collection";

export type NftDescribeResult = {
  name: string;
  description: string;
  mode: NftMintMode;
  collection: string;
  rationale: string;
  source: "ai" | "heuristic";
  warnings: string[];
};

const SCHEMA =
  "Return ONLY valid JSON with keys: name (2-200 chars), description (string, max 8000), mode (single or collection), collection (0x address of an existing collection, or empty), rationale (1-3 short sentences). Do not invent royalty, editions, or media files. Never mint or deploy.";

function asString(raw: unknown): string {
  return typeof raw === "string" ? raw : raw == null ? "" : String(raw);
}

export function normalizeNftDescribeFields(raw: Record<string, unknown>): Omit<
  NftDescribeResult,
  "source" | "warnings"
> | null {
  const name = cleanNftText(asString(raw.name)).trim().slice(0, NFT_NAME_MAX);
  const description = cleanNftText(asString(raw.description)).trim().slice(0, NFT_DESCRIPTION_MAX);
  if (name.length < NFT_NAME_MIN) return null;
  const modeRaw = asString(raw.mode).trim().toLowerCase();
  const collectionRaw = asString(raw.collection).trim();
  const collection = isHexAddress(collectionRaw) ? collectionRaw : "";
  const mode: NftMintMode =
    modeRaw === "collection" || collection ? "collection" : "single";
  const rationale = cleanNftText(asString(raw.rationale)).trim().slice(0, 600);
  return { name, description, mode, collection, rationale };
}

function guessNftName(text: string): string {
  const quoted = text.match(/["“]([^"”]{2,80})["”]/);
  if (quoted) return cleanNftText(quoted[1]!).trim().slice(0, NFT_NAME_MAX);
  const named = text.match(/\bnamed\s+([A-Za-z][\w\s-]{1,60})/i);
  if (named) return cleanNftText(named[1]!).trim().slice(0, NFT_NAME_MAX);
  const words = text
    .replace(/[^A-Za-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length >= 2) return words.slice(0, 4).join(" ").slice(0, NFT_NAME_MAX);
  return "Community NFT";
}

export function parseNftDescriptionHeuristic(description: string): NftDescribeResult | null {
  const text = description.trim();
  if (text.length < 8) return null;
  const addr = text.match(/0x[a-fA-F0-9]{40}/);
  const wantsCollection =
    Boolean(addr) || /\b(collection|series|drop)\b/i.test(text);
  const name = guessNftName(text);
  const desc = cleanNftText(text).slice(0, NFT_DESCRIPTION_MAX);
  return {
    name,
    description: desc,
    mode: wantsCollection ? "collection" : "single",
    collection: addr ? addr[0]! : "",
    rationale: "",
    source: "heuristic",
    warnings: [],
  };
}

export async function parseNftDescription(
  description: string,
  lang: string,
): Promise<NftDescribeResult | null> {
  const aiLang = allowlistDescribeLang(lang);
  const ai = await runDescribeHelperAi(
    [
      "You help people draft NFT mint forms on PEOPLE Blockchain.",
      "Return only form field values. Never mint, deploy, or request a signature.",
      "The live form has name, description, single vs existing-collection, and an optional collection address.",
      "There is no royalty field and no editions/supply field on this form — omit them.",
      SCHEMA,
    ].join(" "),
    description,
    aiLang,
  );
  if (ai) {
    const fields = normalizeNftDescribeFields(ai);
    if (fields) return { ...fields, source: "ai", warnings: [] };
  }
  return parseNftDescriptionHeuristic(description);
}
