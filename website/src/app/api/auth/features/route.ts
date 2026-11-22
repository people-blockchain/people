import { isGoogleConfigured, isResendConfigured, isAuthConfigured } from "@/lib/partner/guards";
import { isWalletVaultConfigured } from "@/lib/wallet-cloud-server";
import { isCloudWalletEnabled } from "@/lib/cloud-wallet";
import { isTurnkeyConfigured, isTurnkeyWalletReady, readPublicTurnkeyOrganizationId } from "@/lib/turnkey-config";
import { readWalletProvider } from "@/lib/wallet-provider-flag";
import { NextResponse } from "next/server";
import { PUBLIC_CACHE_60S } from "@/lib/public-cache";

export async function GET() {
  const cloud = isCloudWalletEnabled();
  const walletProvider = readWalletProvider();
  return NextResponse.json({
    auth: isAuthConfigured(),
    // Session-only Google / Magic Link do not require the custodial cloud-wallet
    // kill-switch. `cloudWallet` below still reports (and enforces) that flag.
    google: isGoogleConfigured(),
    magic: isResendConfigured(),
    walletVault: isWalletVaultConfigured(),
    cloudWallet: cloud,
    walletProvider,
    turnkey: {
      configured: isTurnkeyConfigured(),
      ready: isTurnkeyWalletReady(),
      organizationId: walletProvider === "turnkey" ? readPublicTurnkeyOrganizationId() || null : null,
    },
  }, { headers: PUBLIC_CACHE_60S });
}
