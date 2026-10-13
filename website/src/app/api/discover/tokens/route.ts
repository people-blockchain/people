import { NextResponse } from "next/server";
import { listDiscoverTokensFromNode } from "@/lib/discover/seed";

export async function GET() {
  const tokens = await listDiscoverTokensFromNode();
  return NextResponse.json({ tokens });
}
