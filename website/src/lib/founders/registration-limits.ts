import { eq, sql } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founderSlotCounts } from "@/db/schema";
import { FOUNDERS_MAX_PER_DEVICE, FOUNDERS_MAX_PER_IP } from "./config.ts";
import { hashOpaqueId } from "./phone-hash.ts";
import { withinRegistrationCap } from "./antibot.ts";

export function hashDeviceSlot(deviceId: string): string {
  return hashOpaqueId(deviceId.trim(), "device");
}

export function hashIpSlot(ip: string): string {
  return hashOpaqueId(ip.trim(), "ip");
}

async function slotCount(slotHash: string): Promise<number> {
  const db = await getDbReady();
  const row = await db
    .select()
    .from(founderSlotCounts)
    .where(eq(founderSlotCounts.slotHash, slotHash))
    .limit(1);
  return Number(row[0]?.founderCount ?? 0);
}

export async function checkRegistrationSlots(
  deviceId: string | undefined,
  ip: string,
): Promise<{ ok: true } | { ok: false; error: "device_cap" | "ip_cap" }> {
  if (ip) {
    const ipHash = hashIpSlot(ip);
    const ipCount = await slotCount(ipHash);
    if (!withinRegistrationCap(ipCount, FOUNDERS_MAX_PER_IP)) {
      return { ok: false, error: "ip_cap" };
    }
  }
  if (deviceId?.trim()) {
    const deviceHash = hashDeviceSlot(deviceId);
    const deviceCount = await slotCount(deviceHash);
    if (!withinRegistrationCap(deviceCount, FOUNDERS_MAX_PER_DEVICE)) {
      return { ok: false, error: "device_cap" };
    }
  }
  return { ok: true };
}

export async function incrementRegistrationSlots(deviceId: string | undefined, ip: string) {
  const db = await getDbReady();
  if (ip) {
    const ipHash = hashIpSlot(ip);
    await db
      .insert(founderSlotCounts)
      .values({ slotHash: ipHash, kind: "ip", founderCount: 1 })
      .onConflictDoUpdate({
        target: founderSlotCounts.slotHash,
        set: {
          founderCount: sql`${founderSlotCounts.founderCount} + 1`,
          updatedAt: new Date(),
        },
      });
  }
  if (deviceId?.trim()) {
    const deviceHash = hashDeviceSlot(deviceId);
    await db
      .insert(founderSlotCounts)
      .values({ slotHash: deviceHash, kind: "device", founderCount: 1 })
      .onConflictDoUpdate({
        target: founderSlotCounts.slotHash,
        set: {
          founderCount: sql`${founderSlotCounts.founderCount} + 1`,
          updatedAt: new Date(),
        },
      });
  }
}
