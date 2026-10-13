/**
 * AI icon generation (FLUX.1 schnell) — public constants and env gates.
 * Paid fee is owner-tunable via env; not a protocol economic rule.
 */

import { resolveFluxProvider } from "./flux-generate.ts";

export const ICON_GEN_IMAGE_SIZE = 512;
export const ICON_GEN_VARIANTS = 4;
export const ICON_GEN_FREE_PER_DAY = 3;
export const ICON_GEN_SUBJECT_MAX_LEN = 100;

/** Default paid fee per generation batch after free quota (PPL). */
export const DEFAULT_ICON_GEN_PAID_FEE_PPL = 0.1;

/** Hard cap on paid+free generation batches per UTC day (all wallets). */
export const DEFAULT_ICON_GEN_GLOBAL_DAILY_CAP = 2_000;

export type IconPresetId = "flat" | "badge" | "mascot";

export const ICON_PRESET_IDS: IconPresetId[] = ["flat", "badge", "mascot"];

export function readIconGenPaidFeePpl(): number {
  const raw = (process.env.NEXT_PUBLIC_ICON_GEN_FEE_PPL ?? "").trim();
  if (!raw) return DEFAULT_ICON_GEN_PAID_FEE_PPL;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_ICON_GEN_PAID_FEE_PPL;
}

export function readIconGenGlobalDailyCap(): number {
  const raw = (process.env.ICON_GEN_GLOBAL_DAILY_CAP ?? "").trim();
  if (!raw) return DEFAULT_ICON_GEN_GLOBAL_DAILY_CAP;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_ICON_GEN_GLOBAL_DAILY_CAP;
}

export function isPinataConfigured(): boolean {
  return Boolean(process.env.PINATA_JWT?.trim());
}

/** Feature visible when IPFS pinning works and any supported FLUX backend is available. */
export function isAiIconFeatureEnabled(): boolean {
  return isPinataConfigured() && resolveFluxProvider() !== null;
}

export { resolveFluxProvider } from "./flux-generate.ts";

export function iconFeeRecipientAddress(): string | null {
  const v = (process.env.FACTORY_ICON_FEE_RECIPIENT ?? "").trim();
  return v.length > 0 ? v : null;
}

export function ipfsGatewayBase(): string {
  const custom = (process.env.IPFS_GATEWAY_URL ?? "").trim().replace(/\/$/, "");
  if (custom) return custom;
  return "https://gateway.pinata.cloud/ipfs";
}

export function buildPresetPrompt(preset: IconPresetId, subject: string): string {
  const clean = subject.trim().replace(/\s+/g, " ");
  const base =
    preset === "flat"
      ? "Flat vector app icon, simple shapes, bold colors, centered symbol, no text, white or soft gradient background"
      : preset === "badge"
        ? "Circular badge emblem, clean outline, medal style, centered motif, no text, high contrast"
        : "Friendly mascot character, simple cartoon style, full body or bust, cheerful, no text, plain background";
  return `${base}. Subject: ${clean}. Square 512px icon artwork, crisp edges, no watermark, no letters.`;
}
