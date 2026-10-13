import { getFounderByUserId, registerFounder } from "@/lib/founders/service";

export type FounderBridgeResult =
  | { status: "already_founder"; founderNumber: number }
  | { status: "registered"; founderNumber: number }
  | { status: "skipped"; reason: string };

/** After first Lavka redemption, enroll customer in Million Founders (track A). */
export async function enrollFounderAfterFirstRedeem(
  customerUserId: string,
  countryCode: string,
  merchantUserId: string,
  ip: string,
): Promise<FounderBridgeResult> {
  const existing = await getFounderByUserId(customerUserId);
  if (existing) {
    return { status: "already_founder", founderNumber: existing.founderNumber };
  }
  const result = await registerFounder(customerUserId, countryCode, {
    invitedByUserId: merchantUserId,
    ip,
  });
  if (result.ok) {
    return { status: "registered", founderNumber: result.profile.founderNumber };
  }
  if (result.error === "already_registered") {
    const again = await getFounderByUserId(customerUserId);
    if (again) return { status: "already_founder", founderNumber: again.founderNumber };
  }
  return { status: "skipped", reason: result.ok ? "ok" : result.error };
}
