import { NextResponse } from "next/server";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import { createQuestSecretWord, exportQuestReviewCsv } from "@/lib/founders/quest/service";
import { SECRET_WORD_TTL_MS } from "@/lib/founders/quest/config";

export async function POST(request: Request) {
  if (!(await isDiscoverAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as { platform?: string; word?: string; validFrom?: string };
  const platform = body.platform === "medium" ? "medium" : "youtube";
  const word = body.word?.trim() ?? "";
  const validFrom = body.validFrom ? new Date(body.validFrom) : new Date();
  if (!word) return NextResponse.json({ error: "invalid_word" }, { status: 400 });
  try {
    const created = await createQuestSecretWord({
      platform,
      word,
      validFrom,
      validTo: new Date(validFrom.getTime() + SECRET_WORD_TTL_MS),
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch {
    return NextResponse.json({ error: "invalid_word" }, { status: 400 });
  }
}

export async function GET() {
  if (!(await isDiscoverAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const csv = await exportQuestReviewCsv();
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="genesis-quest-export.csv"',
    },
  });
}
