import { checkSharedRateLimit } from "@/lib/api-rate-limit";

export type DirectUploadRateRule = { namespace: string; limit: number; windowMs: number };

/** Per-address and per-IP budgets for the direct upload routes. Global caps sit beside them. */
export const DIRECT_UPLOAD_RATE = {
  signIp: { namespace: "direct-upload-sign-ip", limit: 10, windowMs: 10 * 60_000 },
  signAddress: { namespace: "direct-upload-sign-address", limit: 6, windowMs: 10 * 60_000 },
  signGlobal: { namespace: "direct-upload-sign-global", limit: 400, windowMs: 24 * 60 * 60_000 },
  verifyIp: { namespace: "direct-upload-verify-ip", limit: 20, windowMs: 10 * 60_000 },
  verifyGlobal: { namespace: "direct-upload-verify-global", limit: 400, windowMs: 24 * 60 * 60_000 },
  nonceIp: { namespace: "direct-upload-nonce-ip", limit: 40, windowMs: 10 * 60_000 },
  nonceAddress: { namespace: "direct-upload-nonce-address", limit: 20, windowMs: 10 * 60_000 },
} as const satisfies Record<string, DirectUploadRateRule>;

/** Address bucket. Uses the same shared limiter as the IP rules (Postgres when configured). */
export async function directUploadAddressAllowed(address: string, rule: DirectUploadRateRule): Promise<boolean> {
  return checkSharedRateLimit(rule.namespace, address.toLowerCase(), rule.limit, rule.windowMs);
}
