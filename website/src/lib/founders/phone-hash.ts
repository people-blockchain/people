import { createHash, timingSafeEqual } from "node:crypto";
import { normalizePhoneE164 } from "./verification.ts";

export function phoneHashSalt(): string {
  const salt = process.env.FOUNDERS_PHONE_HASH_SALT?.trim();
  if (!salt) {
    throw new Error("FOUNDERS_PHONE_HASH_SALT is not set");
  }
  return salt;
}

export function hashPhoneNumber(phoneE164: string): string {
  const normalized = normalizePhoneE164(phoneE164);
  if (!normalized) throw new Error("invalid_phone");
  return createHash("sha256").update(`${phoneHashSalt()}:${normalized}`).digest("hex");
}

export function hashOpaqueId(value: string, namespace: string): string {
  const salt = process.env.FOUNDERS_PHONE_HASH_SALT?.trim();
  if (!salt) {
    // These hashes are the anti-sybil census slots for device/IP. A public fallback salt
    // lets anyone recompute them and deliberately collide the registration caps, so fail
    // closed in production; a fixed dev value keeps local/staging usable.
    if (process.env.NODE_ENV === "production") {
      throw new Error("FOUNDERS_PHONE_HASH_SALT is not set");
    }
    return createHash("sha256").update(`founders-opaque:${namespace}:${value}`).digest("hex");
  }
  return createHash("sha256").update(`${salt}:${namespace}:${value}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
