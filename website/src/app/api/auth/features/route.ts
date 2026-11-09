import { isGoogleConfigured, isResendConfigured, isAuthConfigured } from "@/lib/partner/guards";
import { isWalletVaultConfigured } from "@/lib/wallet-cloud-server";
import { isCloudWalletEnabled } from "@/lib/cloud-wallet";
import { NextResponse } from "next/server";

export async function GET() {
  const cloud = isCloudWalletEnabled();
  return NextResponse.json({
    auth: isAuthConfigured(),
    google: isGoogleConfigured() && cloud,
    magic: isResendConfigured() && cloud,
    walletVault: isWalletVaultConfigured(),
    cloudWallet: cloud,
  });
}
