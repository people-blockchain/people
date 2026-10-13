import { NextResponse } from "next/server";
import { readFoundersWorldIdConfig } from "@/lib/founders/world-id-config";

export async function GET() {
  const config = readFoundersWorldIdConfig();
  if (!config) {
    return NextResponse.json({ enabled: false });
  }
  return NextResponse.json({
    enabled: true,
    appId: config.appId,
    rpId: config.rpId,
    action: config.action,
  });
}
