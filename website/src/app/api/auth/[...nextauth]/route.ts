import { handlers } from "@/auth";
import { ensurePartnerSchema } from "@/db";
import { authGetNeedsSchema } from "@/lib/auth-schema-skip";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  // JWT session/csrf/providers reads never touch the database; don't charge them the schema
  // bootstrap (91 sequential DDL statements) that the sign-in and callback paths do need.
  if (authGetNeedsSchema(new URL(request.url).pathname)) await ensurePartnerSchema();
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  await ensurePartnerSchema();
  return handlers.POST(request);
}
