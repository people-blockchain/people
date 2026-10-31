import type { Hex } from "viem";

export type ApprovalReceipt = { status: "success" | "reverted" };

/**
 * Sends an ERC-20 approval only when the allowance is short, waits for that
 * transaction to be mined, then reads the allowance again. The follow-up
 * action (swap, buy) must not run unless this returns `{ ok: true }`.
 */
export async function approveErc20IfNeeded(input: {
  amount: bigint;
  readAllowance: () => Promise<bigint>;
  approve: () => Promise<Hex>;
  waitForReceipt: (hash: Hex) => Promise<ApprovalReceipt>;
}): Promise<{ ok: true } | { ok: false; reason: "reverted" | "allowance_short" }> {
  const current = await input.readAllowance();
  if (current >= input.amount) return { ok: true };
  const hash = await input.approve();
  const receipt = await input.waitForReceipt(hash);
  if (receipt.status !== "success") return { ok: false, reason: "reverted" };
  const after = await input.readAllowance();
  if (after < input.amount) return { ok: false, reason: "allowance_short" };
  return { ok: true };
}
