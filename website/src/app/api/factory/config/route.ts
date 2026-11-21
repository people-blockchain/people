import { NextResponse } from "next/server";
import { getFactoryPublicConfig } from "@/lib/factory-config";
import { PUBLIC_CACHE_60S } from "@/lib/public-cache";

export function GET() {
  const config = getFactoryPublicConfig();
  return NextResponse.json({
    ...config,
    // Never echo secrets. rpcUrl is public by design when the owner sets NEXT_PUBLIC_*.
  }, { headers: PUBLIC_CACHE_60S });
}
