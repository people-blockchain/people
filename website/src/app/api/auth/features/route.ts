import { isGoogleConfigured, isResendConfigured, isAuthConfigured } from "@/lib/partner/guards";
import { isWalletVaultConfigured } from "@/lib/wallet-cloud-server";
import { isCloudWalletEnabled } from "@/lib/cloud-wallet";
import { NextResponse } from "next/server";

export async function GET() {
  const cloud = isCloudWalletEnabled();
  return NextResponse.json({
    auth: isAuthConfigured(),
    // Session-only Google / Magic Link do not require the custodial cloud-wallet
    // kill-switch. `cloudWallet` below still reports (and enforces) that flag.
    google: isGoogleConfigured(),
    magic: isResendConfigured(),
    walletVault: isWalletVaultConfigured(),
    cloudWallet: cloud,
  });
}
