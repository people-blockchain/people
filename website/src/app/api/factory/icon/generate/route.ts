import { NextResponse } from "next/server";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { checkDurableRateLimit } from "@/lib/durable-rate-limit";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import {
  ICON_GEN_SUBJECT_MAX_LEN,
  ICON_GEN_VARIANTS,
  buildPresetPrompt,
  isAiIconFeatureEnabled,
  readIconGenGlobalDailyCap,
  type IconPresetId,
} from "@/lib/factory-icon-config";
import { moderateIconSubject } from "@/lib/factory-icon-moderation";
import { isWalletFreeIconEligible } from "@/lib/factory-icon-eligibility";
import {
  previewIconGenQuota,
  releaseIconGenSlot,
  reserveIconGenSlot,
  getGlobalIconGenCountForDay,
  utcDayKey,
} from "@/lib/factory-icon-quota";
import {
  generateFluxSchnellPng,
  resolveFluxProvider,
  variantDelayMsForProvider,
} from "@/lib/flux-generate";
import { verifyTurnstileToken } from "@/lib/turnstile";
import {
  claimIconGenPaymentTx,
  releaseIconGenPaymentTx,
  verifyIconGenPaymentTx,
} from "@/lib/factory-icon-payment";
import { verifyIconQuotaProof } from "@/lib/factory-icon-proof";

const IP_LIMIT = 12;
const IP_WINDOW_MS = 60_000;

function isPreset(value: string): value is IconPresetId {
  return value === "flat" || value === "badge" || value === "mascot";
}

/**
 * M2: the per-IP budget lives in Postgres so it is shared across Vercel instances instead of
 * being multiplied by them. If the DB is unreachable we fall back to the per-instance limiter
 * rather than failing open — a burst can still be stopped within one instance.
 */
async function ipRateLimitAllowed(ip: string): Promise<boolean> {
  try {
    return await checkDurableRateLimit("factory-icon-gen", ip, IP_LIMIT, IP_WINDOW_MS);
  } catch (error) {
    console.warn(
      "[factory-icon] durable rate limit unavailable, falling back to in-memory",
      error instanceof Error ? error.message : error
    );
    return checkSlidingWindowRateLimit("factory-icon-gen", ip, IP_LIMIT, IP_WINDOW_MS);
  }
}

export async function POST(request: Request) {
  if (!isAiIconFeatureEnabled()) {
    return NextResponse.json({ error: "feature_disabled" }, { status: 404 });
  }

  const ip = clientIpFromRequest(request);
  if (!(await ipRateLimitAllowed(ip))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    wallet?: string;
    preset?: string;
    subject?: string;
    turnstileToken?: string;
    paymentTxId?: string;
    /** L1 wallet-ownership proof for the free path (see factory-icon-proof.ts). */
    proofNonce?: string;
    proofIssuedAt?: number;
    proofPublicKey?: string;
    proofSignature?: string;
  };

  const wallet = (body.wallet ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "invalid_wallet" }, { status: 400 });
  }

  const turnstileOk = await verifyTurnstileToken(body.turnstileToken ?? "", ip);
  if (!turnstileOk) {
    return NextResponse.json({ error: "captcha_failed" }, { status: 403 });
  }

  const preset = body.preset ?? "";
  if (!isPreset(preset)) {
    return NextResponse.json({ error: "invalid_preset" }, { status: 400 });
  }

  const subject = (body.subject ?? "").slice(0, ICON_GEN_SUBJECT_MAX_LEN);
  const mod = moderateIconSubject(subject);
  if (!mod.ok) {
    return NextResponse.json({ error: mod.code }, { status: 400 });
  }

  // M20-4: free batches only for a wallet bound to a Telegram- or Human-Passport-verified
  // founder; every other wallet goes straight to the paid path below.
  const freeEligible = await isWalletFreeIconEligible(wallet);
  const quotaPreview = await previewIconGenQuota(wallet, utcDayKey(), freeEligible);
  if (!quotaPreview.allowed && quotaPreview.reason === "global_cap") {
    console.error(
      `[factory-icon] global daily cap reached (${await getGlobalIconGenCountForDay(utcDayKey())}/${readIconGenGlobalDailyCap()})`
    );
    return NextResponse.json({ error: "global_cap" }, { status: 503 });
  }

  let charge: "free" | "paid" = "free";
  if (!quotaPreview.allowed && quotaPreview.reason === "payment_required") {
    const paymentTxId = (body.paymentTxId ?? "").trim();
    if (!paymentTxId) {
      return NextResponse.json({ error: "payment_required" }, { status: 402 });
    }
    const paid = await verifyIconGenPaymentTx(paymentTxId, wallet);
    if (!paid.ok) {
      return NextResponse.json({ error: paid.code }, { status: 402 });
    }
    // One on-chain payment authorizes exactly one batch.
    if (!(await claimIconGenPaymentTx(paymentTxId, wallet, utcDayKey()))) {
      return NextResponse.json({ error: "payment_tx_used" }, { status: 402 });
    }
    charge = "paid";
  } else if (quotaPreview.allowed) {
    charge = quotaPreview.charge;
    // L1: a free batch is a perk of a specific wallet, and the address in the body could be
    // anyone's. Require a signature proving the caller holds the key before spending it.
    if (charge === "free") {
      const proof = verifyIconQuotaProof({
        wallet,
        nonce: body.proofNonce ?? "",
        issuedAt: Number(body.proofIssuedAt),
        publicKey: body.proofPublicKey ?? "",
        signature: body.proofSignature ?? "",
      });
      if (!proof.ok) {
        return NextResponse.json({ error: proof.code }, { status: 403 });
      }
    }
  }

  // AUDIT M2: the preview above is only a read; take the slot atomically before spending any
  // provider calls so parallel requests cannot all slip through the free quota / global cap.
  const day = utcDayKey();
  const reservation = await reserveIconGenSlot(wallet, charge, day);
  if (!reservation.ok) {
    if (charge === "paid") await releaseIconGenPaymentTx((body.paymentTxId ?? "").trim());
    if (reservation.reason === "global_cap") {
      return NextResponse.json({ error: "global_cap" }, { status: 503 });
    }
    return NextResponse.json({ error: "payment_required" }, { status: 402 });
  }

  const prompt = buildPresetPrompt(preset, subject);
  const seeds = [11, 22, 33, 44].map((n, i) => Date.now() % 10_000 + n + i);
  const variants: Array<{ index: number; previewBase64: string }> = [];

  const fluxProvider = resolveFluxProvider();
  const variantDelayMs = fluxProvider ? variantDelayMsForProvider(fluxProvider) : 0;

  try {
    for (let i = 0; i < ICON_GEN_VARIANTS; i++) {
      if (i > 0 && variantDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, variantDelayMs));
      }
      const png = await generateFluxSchnellPng(prompt, seeds[i]);
      const previewBase64 = Buffer.from(png).toString("base64");
      variants.push({ index: i, previewBase64 });
    }
  } catch (err) {
    await releaseIconGenSlot(wallet, day);
    if (charge === "paid") await releaseIconGenPaymentTx((body.paymentTxId ?? "").trim());
    const message = err instanceof Error ? err.message : "generation_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({
    variants: variants.map((v) => ({
      index: v.index,
      preview: `data:image/png;base64,${v.previewBase64}`,
    })),
    freeRemaining: reservation.freeRemainingAfter,
    charge,
  });
}
