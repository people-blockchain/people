import type { FounderActionType } from "./config";

/**
 * The server verifies these actions against the tx receipt itself (see chain-verify.ts) —
 * the only thing the client contributes is which tx to look up.
 */
export async function recordFounderAction(
  action: FounderActionType,
  txHash: string,
): Promise<{ ok: boolean; awardedPoints?: number }> {
  try {
    const res = await fetch("/api/founders/actions", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, txHash }),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { awardedPoints?: number };
    return { ok: true, awardedPoints: data.awardedPoints };
  } catch {
    return { ok: false };
  }
}
