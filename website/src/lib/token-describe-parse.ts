import { MIN_TOKEN_SUPPLY_WHOLE } from "@/lib/token-supply-limits";
import { launchSpotFromSupplyWhole, supplyWholeForMaxSpotPpl, type LaunchSpotPrice } from "@/lib/token-curve-start-price";
import { parseTokenDescriptionWithAi, type TokenDescribeModelJson } from "@/lib/token-describe-ai";

export type TokenDescribeResult = {
  name: string;
  symbol: string;
  supply: string;
  /** Extra context from the model; may be empty when heuristic-only. */
  rationale: string;
  price: LaunchSpotPrice;
  source: "ai" | "heuristic";
  warnings: TokenDescribeWarningCode[];
};

const FUNDRAISE_RE =
  /\b(raise|raising|fundraising|collect|gather)\b[^\n]{0,80}\$?\s*\d[\d,]*\s*(m|million|bn|billion|k|thousand)?/i;
const DOLLAR_PRICE_RE =
  /\$\s*(\d+(?:[.,]\d+)?)\s*(?:per\s+token|each|a\s+token|start(?:ing)?\s*price)?/i;
const CENT_PRICE_RE =
  /(\d+(?:[.,]\d+)?)\s*(cent|cents|¢)(?:\s+per\s+token|\s+each)?/i;

export function containsFundraisingPromise(text: string): boolean {
  return FUNDRAISE_RE.test(text);
}

export type TokenDescribeWarningCode = "fundraising_not_guaranteed" | "dollar_not_configurable";

function parseSupplyNumber(text: string): bigint | null {
  const lower = text.toLowerCase();
  const million = lower.match(/(\d[\d,._\s]*)\s*(million|m(?:illion)?|млн)/i);
  if (million) {
    const n = Number(million[1].replace(/[\s,_]/g, ""));
    if (Number.isFinite(n) && n > 0) return BigInt(Math.round(n * 1_000_000));
  }
  const billion = lower.match(/(\d[\d,._\s]*)\s*(billion|bn|b)/i);
  if (billion) {
    const n = Number(billion[1].replace(/[\s,_]/g, ""));
    if (Number.isFinite(n) && n > 0) return BigInt(Math.round(n * 1_000_000_000));
  }
  const plain = lower.match(/\b(\d[\d,._\s]{2,})\s*(?:tokens?)?\b/);
  if (plain) {
    const clean = plain[1].replace(/[\s,_]/g, "");
    if (/^\d+$/.test(clean)) {
      try {
        return BigInt(clean);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function guessName(text: string): string {
  const quoted = text.match(/["“]([^"”]{2,40})["”]/);
  if (quoted) return titleCase(quoted[1].trim());
  const forChannel = text.match(/\bfor\s+(?:my\s+)?([A-Za-z][\w\s-]{2,30})/i);
  if (forChannel) return titleCase(forChannel[1].replace(/\s+channel$/i, "").trim());
  const words = text
    .replace(/[^A-Za-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
  if (words.length >= 2) return titleCase(words.slice(0, 3).join(" "));
  return "Community Token";
}

function guessSymbol(name: string, text: string): string {
  const explicit = text.match(/\b(?:ticker|symbol)\s*[:=]?\s*([A-Z]{2,8})\b/);
  if (explicit) return explicit[1].slice(0, 8);
  const upper = text.match(/\b[A-Z]{2,8}\b/);
  if (upper && upper[0].length >= 2) return upper[0].slice(0, 8);
  const parts = name.replace(/[^A-Za-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 6).toUpperCase();
  return parts
    .map((p) => p[0])
    .join("")
    .slice(0, 8)
    .toUpperCase();
}

const STOP_WORDS = new Set([
  "want",
  "token",
  "tokens",
  "for",
  "my",
  "the",
  "with",
  "million",
  "subscribers",
  "channel",
  "create",
  "launch",
  "coffee",
  "telegram",
]);

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ")
    .slice(0, 32);
}

function normalizeModelFields(raw: TokenDescribeModelJson): {
  name: string;
  symbol: string;
  supply: bigint;
  rationale: string;
} | null {
  const name = (raw.name ?? "").trim().slice(0, 32);
  const symbol = (raw.symbol ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const supplyClean = String(raw.supply ?? "").replace(/[\s,_]/g, "");
  if (name.length < 2 || symbol.length < 2 || !/^\d+$/.test(supplyClean)) return null;
  let supply: bigint;
  try {
    supply = BigInt(supplyClean);
  } catch {
    return null;
  }
  if (supply < BigInt(MIN_TOKEN_SUPPLY_WHOLE)) return null;
  const rationale = (raw.rationale ?? "").trim().slice(0, 600);
  if (!rationale) return null;
  return { name, symbol, supply, rationale };
}

function dollarTargetPpl(text: string): number | null {
  const m = text.match(DOLLAR_PRICE_RE);
  if (m) {
    const usd = Number(m[1].replace(",", "."));
    if (Number.isFinite(usd) && usd > 0) {
      // We do not fix a PPL/USD rate for community tokens; treat as soft target via env hint only.
      const pplUsd = Number(process.env.TOKEN_DESCRIBE_PPL_USD_HINT ?? "0");
      if (pplUsd > 0) return usd / pplUsd;
    }
  }
  const c = text.match(CENT_PRICE_RE);
  if (c) {
    const cents = Number(c[1].replace(",", "."));
    if (Number.isFinite(cents) && cents > 0) {
      const pplUsd = Number(process.env.TOKEN_DESCRIBE_PPL_USD_HINT ?? "0");
      if (pplUsd > 0) return (cents / 100) / pplUsd;
    }
  }
  return null;
}


export function parseTokenDescriptionHeuristic(description: string): TokenDescribeResult | null {
  const text = description.trim();
  if (text.length < 8) return null;

  const warnings: TokenDescribeWarningCode[] = [];
  if (containsFundraisingPromise(text)) {
    warnings.push("fundraising_not_guaranteed");
  }

  let supply = parseSupplyNumber(text) ?? BigInt(1_000_000);
  const mentionsUsd = DOLLAR_PRICE_RE.test(text) || CENT_PRICE_RE.test(text);
  const targetPpl = dollarTargetPpl(text);
  if (mentionsUsd) {
    warnings.push("dollar_not_configurable");
    if (targetPpl) {
      const tuned = supplyWholeForMaxSpotPpl(targetPpl);
      if (tuned) supply = tuned;
    } else if (supply < BigInt(10_000_000)) {
      // No PPL/USD oracle here: pick a larger supply so formula spot moves down.
      supply = BigInt(10_000_000);
    }
  }

  if (supply < BigInt(MIN_TOKEN_SUPPLY_WHOLE)) supply = BigInt(MIN_TOKEN_SUPPLY_WHOLE);

  const name = guessName(text);
  const symbol = guessSymbol(name, text);
  const price = launchSpotFromSupplyWhole(supply);
  if (!price) return null;

  return {
    name,
    symbol,
    supply: String(supply),
    rationale: "",
    price,
    source: "heuristic",
    warnings,
  };
}

export async function parseTokenDescription(
  description: string,
  lang: string,
): Promise<TokenDescribeResult | null> {
  const warnings: TokenDescribeWarningCode[] = [];
  if (containsFundraisingPromise(description)) {
    warnings.push("fundraising_not_guaranteed");
  }

  const aiLang = lang === "ru" ? "en" : lang;
  const ai = await parseTokenDescriptionWithAi(description, aiLang);
  if (ai) {
    const fields = normalizeModelFields(ai);
    if (fields) {
      const price = launchSpotFromSupplyWhole(fields.supply);
      if (!price) return parseTokenDescriptionHeuristic(description);
      let rationale = fields.rationale;
      if (containsFundraisingPromise(rationale)) {
        rationale = "";
        if (!warnings.includes("fundraising_not_guaranteed")) {
          warnings.push("fundraising_not_guaranteed");
        }
      }
      return {
        name: fields.name,
        symbol: fields.symbol,
        supply: String(fields.supply),
        rationale,
        price,
        source: "ai",
        warnings,
      };
    }
  }
  const heuristic = parseTokenDescriptionHeuristic(description);
  if (!heuristic) return null;
  return { ...heuristic, warnings: [...new Set([...warnings, ...heuristic.warnings])] };
}