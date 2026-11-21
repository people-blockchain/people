import { LAVKA_MAX_VISITS_PER_PURCHASE } from "@/lib/lavka/contracts";
import { MAX_PROGRAM_TITLE } from "@/lib/lavka/limits";
import { allowlistDescribeLang } from "@/lib/describe-helper-lang";
import { runDescribeHelperAi } from "@/lib/describe-helper-ai";

export type LavkaDescribeResult = {
  title: string;
  visits: string;
  pricePpl: string;
  validDays: string;
  transferable: boolean;
  rationale: string;
  source: "ai" | "heuristic";
  warnings: string[];
};

function asString(raw: unknown): string {
  return typeof raw === "string" ? raw : raw == null ? "" : String(raw);
}

function clipTitle(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, MAX_PROGRAM_TITLE);
}

function intInRange(raw: unknown, min: number, max: number): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[_\s,]/g, ""));
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function priceInRange(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[_\s,]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return n;
}

export function normalizeLavkaDescribeFields(
  raw: Record<string, unknown>,
): Omit<LavkaDescribeResult, "source" | "warnings"> | null {
  const title = clipTitle(asString(raw.title));
  if (title.length < 2) return null;
  const visits = intInRange(raw.visits, 1, LAVKA_MAX_VISITS_PER_PURCHASE);
  const price = priceInRange(raw.pricePpl);
  const validDays = intInRange(raw.validDays, 1, 3650);
  if (visits == null || price == null || validDays == null) return null;
  const transferable = raw.transferable === true || String(raw.transferable).toLowerCase() === "true";
  return {
    title,
    visits: String(visits),
    pricePpl: String(price),
    validDays: String(validDays),
    transferable,
    rationale: asString(raw.rationale).trim().slice(0, 600),
  };
}

export function parseLavkaDescriptionHeuristic(description: string): LavkaDescribeResult | null {
  const text = description.trim();
  if (text.length < 8) return null;
  const visitsMatch = text.match(/\b(\d{1,3})\s*(visit|visits|stamp|stamps|punch)/i);
  const priceMatch = text.match(/\b(\d+(?:\.\d+)?)\s*ppl\b/i);
  const daysMatch = text.match(/\b(\d{1,4})\s*(day|days)\b/i);
  const quoted = text.match(/["“]([^"”]{2,80})["”]/);
  const visits = intInRange(visitsMatch?.[1] ?? 5, 1, LAVKA_MAX_VISITS_PER_PURCHASE) ?? 5;
  const price = priceInRange(priceMatch?.[1] ?? 1) ?? 1;
  const validDays = intInRange(daysMatch?.[1] ?? 90, 1, 3650) ?? 90;
  const title = clipTitle(quoted?.[1] ?? "Loyalty pass");
  return {
    title,
    visits: String(visits),
    pricePpl: String(price),
    validDays: String(validDays),
    transferable: /\btransferable\b/i.test(text) && !/\bnot transferable\b/i.test(text),
    rationale: "",
    source: "heuristic",
    warnings: [],
  };
}

export async function parseLavkaDescription(
  description: string,
  lang: string,
): Promise<LavkaDescribeResult | null> {
  const aiLang = allowlistDescribeLang(lang);
  const ai = await runDescribeHelperAi(
    [
      "You help merchants fill a PEOPLE Lavka loyalty program form.",
      `Return ONLY JSON {title, visits, pricePpl, validDays, transferable, rationale}. visits is 1-${LAVKA_MAX_VISITS_PER_PURCHASE}, pricePpl > 0 PPL, validDays 1-3650, title 2-${MAX_PROGRAM_TITLE} chars.`,
      "Never create the program or request a wallet signature.",
    ].join(" "),
    description,
    aiLang,
  );
  if (ai) {
    const fields = normalizeLavkaDescribeFields(ai);
    if (fields) return { ...fields, source: "ai", warnings: [] };
  }
  return parseLavkaDescriptionHeuristic(description);
}
