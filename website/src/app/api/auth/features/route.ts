import { isGoogleConfigured, isResendConfigured, isAuthConfigured } from "@/lib/partner/guards";
import { isWalletVaultConfigured } from "@/lib/wallet-cloud-server";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    auth: isAuthConfigured(),
    google: isGoogleConfigured(),
    magic: isResendConfigured(),
    walletVault: isWalletVaultConfigured(),
  });
}
