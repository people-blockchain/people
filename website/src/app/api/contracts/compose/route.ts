import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { CONTRACT_COMPOSE_RATE_PER_MIN, MAX_CONTRACT_PROMPT_BYTES, utf8ByteLength } from "@/lib/contract-api-guards";
import { CONTRACT_TEMPLATES, findTemplateById, matchTemplate, templateSummary } from "@/lib/contract-templates";
import { clientIpFromRequest } from "@/lib/request-client-ip";

export const runtime = "nodejs";

interface ComposeBody {
  prompt?: string;
  lang?: string;
  freeform?: boolean;
}

function heuristicParams(prompt: string): Record<string, string> {
  const addresses = prompt.match(/0x[a-fA-F0-9]{40}/g) ?? [];
  const numbers = prompt.match(/\b\d{3,}\b/g) ?? [];
  return {
    address0: addresses[0] ?? "",
    address1: addresses[1] ?? "",
    duration: numbers[0] ?? "2592000",
    amount: numbers[1] ?? "0"
  };
}

async function askModel(prompt: string, lang: "en" | "ru"): Promise<{
  templateId: string;
  summary: string;
  params: Record<string, string>;
} | null> {
  const key = process.env.CONTRACT_AI_API_KEY?.trim();
  if (!key) {
    return null;
  }
  const base = (process.env.CONTRACT_AI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.CONTRACT_AI_MODEL?.trim() || "gpt-4o-mini";
  const catalog = CONTRACT_TEMPLATES.map((t) => `${t.id}: ${t.titleEn} / ${t.titleRu}`).join("; ");
  const res = await fetch(`${base}/chat/completions`, {
    signal: AbortSignal.timeout(20_000),
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Pick exactly one template id from the catalog. Return JSON {templateId, summary, params}. Do not invent economics. Native token is PPL, never VLS. Language of summary: " +
            lang
        },
        {
          role: "user",
          content: `Catalog: ${catalog}\nRequest: ${prompt}`
        }
      ]
    })
  });
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as { templateId: string; summary: string; params: Record<string, string> };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  if (!await checkSharedRateLimit("contracts-compose", ip, CONTRACT_COMPOSE_RATE_PER_MIN, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as ComposeBody;
  const prompt = (typeof body?.prompt === "string" ? body.prompt : "").trim();
  if (prompt.length < 8) {
    return NextResponse.json({ error: "prompt_too_short" }, { status: 400 });
  }
  if (utf8ByteLength(prompt) > MAX_CONTRACT_PROMPT_BYTES) {
    return NextResponse.json({ error: "prompt_too_large" }, { status: 413 });
  }
  const lang = body.lang === "ru" ? "ru" : "en";
  const allowFreeform = process.env.CONTRACT_AI_FREEFORM === "1" || process.env.CONTRACT_AI_FREEFORM === "true";
  if (body.freeform && !allowFreeform) {
    return NextResponse.json({
      error: "freeform_disabled",
      warning: lang === "ru"
        ? "Свободная генерация кода выключена. Используется проверенный шаблон."
        : "Freeform generation is off. A reviewed template will be used."
    }, { status: 400 });
  }

  const ai = await askModel(prompt, lang).catch(() => null);
  const template = (ai && findTemplateById(ai.templateId)) || matchTemplate(prompt);
  const params = { ...heuristicParams(prompt), ...(ai?.params ?? {}) };
  const summary =
    ai?.summary ||
    templateSummary(template, typeof body.lang === "string" ? body.lang : lang);

  return NextResponse.json({
    templateId: template.id,
    title: lang === "ru" ? template.titleRu : template.titleEn,
    summary,
    source: template.source,
    fileName: template.fileName,
    audited: false,
    freeform: false,
    params,
    paramHints: lang === "ru" ? template.paramHintsRu : template.paramHintsEn,
    aiUsed: Boolean(ai),
    warning: lang === "ru"
      ? "Это параметризованный шаблон по образцу OpenZeppelin, не индивидуальный аудит вашего запуска."
      : "This is an OpenZeppelin-based template, not a private audit of your launch."
  });
}
