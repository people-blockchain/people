import { NextResponse } from "next/server";
import {
  isAiIconFeatureEnabled,
  readIconGenPaidFeePpl,
  ICON_GEN_FREE_PER_DAY,
  ICON_PRESET_IDS,
  iconFeeRecipientAddress,
  resolveFluxProvider,
} from "@/lib/factory-icon-config";
import { freeIconGensRemaining, previewIconGenQuota, utcDayKey } from "@/lib/factory-icon-quota";
import { isWalletFreeIconEligible } from "@/lib/factory-icon-eligibility";
import { turnstileSiteKeyPublic } from "@/lib/turnstile";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = (url.searchParams.get("wallet") ?? "").trim();
  const enabled = isAiIconFeatureEnabled();
  if (!enabled) {
    return NextResponse.json({ enabled: false });
  }
  // M20-4: free batches are only for a wallet bound to a verified founder.
  const freeEligible = wallet ? await isWalletFreeIconEligible(wallet) : false;
  const freeRemaining = wallet
    ? await freeIconGensRemaining(wallet, utcDayKey(), freeEligible)
    : ICON_GEN_FREE_PER_DAY;
  let paymentRequired = false;
  let globalCapReached = false;
  if (wallet) {
    const decision = await previewIconGenQuota(wallet, utcDayKey(), freeEligible);
    if (!decision.allowed) {
      paymentRequired = decision.reason === "payment_required";
      globalCapReached = decision.reason === "global_cap";
    }
  }
  return NextResponse.json({
    enabled: true,
    presets: ICON_PRESET_IDS,
    freePerDay: ICON_GEN_FREE_PER_DAY,
    freeRemaining,
    // Null before a wallet is known, so the UI doesn't claim ineligibility pre-connect.
    freeEligible: wallet ? freeEligible : null,
    paidFeePpl: readIconGenPaidFeePpl(),
    paymentRequired,
    globalCapReached,
    turnstileSiteKey: turnstileSiteKeyPublic(),
    feeRecipient: iconFeeRecipientAddress(),
    fluxProvider: resolveFluxProvider(),
  });
}
