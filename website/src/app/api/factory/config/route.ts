import { NextResponse } from "next/server";
import { getFactoryPublicConfig } from "@/lib/factory-config";

export function GET() {
  const config = getFactoryPublicConfig();
  return NextResponse.json({
    ...config,
    // Never echo secrets. rpcUrl is public by design when the owner sets NEXT_PUBLIC_*.
  });
}
