import { timingSafeEqual } from "node:crypto";
import type { Address, Hex } from "viem";

import { createReturnAttestation, type AttestationFailure } from "./return-attestation.ts";
import type { VerifierSigner } from "../verifier/signer.ts";
import type { ReturnLog } from "./return-burn";

/**
 * Independent second signer for sell-back attestations (audit 2026-11-01).
 *
 * It runs as a separate server, ideally at a different provider than the site, with its own
 * PEOPLE RPC and its own key. It re-checks the same `ReturnBurned` receipt and signs only for the
 * on-chain `returnCosigner`. It also brakes and alerts: when the PPL it cosigned in the last hour
 * passes `warnPplPerHour` it alerts the signers; past `maxPplPerHour` it refuses to sign at all, so
 * a compromised site server cannot drain the reserve faster than that even inside the hub's caps.
 */

export type CosignerConfig = {
  token: string;
  hubAddress: string;
  burnAddress: string;
  hubChainId: number;
  /** PPL (wei) per rolling hour above which an alert is sent. */
  warnPplPerHour: bigint;
  /** PPL (wei) per rolling hour above which the cosigner refuses. */
  maxPplPerHour: bigint;
};

export type CosignerDeps = {
  signer: VerifierSigner | null;
  nowSec: () => number;
  getReceipt: (txHash: Hex) => Promise<{ status: string; blockNumber: bigint; logs: readonly ReturnLog[] }>;
  headBlock: () => Promise<bigint>;
  finalizedBlock?: () => Promise<bigint | null>;
  returnCosigner: () => Promise<Address>;
  alert: (text: string) => Promise<void>;
};

export type CosignResponse = { status: number; body: Record<string, unknown> };

const HOUR = 3600;

export function createCosigner(config: CosignerConfig, deps: CosignerDeps) {
  /** returnId → { at, ppl }: what was cosigned, for the hourly brake and to avoid double counting. */
  const signed = new Map<string, { at: number; ppl: bigint }>();
  let lastWarnAt = 0;

  function hourTotal(now: number): bigint {
    let total = BigInt(0);
    for (const [id, e] of signed) {
      if (e.at <= now - HOUR) signed.delete(id);
      else total += e.ppl;
    }
    return total;
  }

  function authorized(header: string | null): boolean {
    const want = Buffer.from(`Bearer ${config.token}`);
    const got = Buffer.from(header ?? "");
    return config.token.length >= 32 && got.length === want.length && timingSafeEqual(got, want);
  }

  async function handle(authHeader: string | null, body: unknown): Promise<CosignResponse> {
    if (!authorized(authHeader)) return { status: 401, body: { error: "unauthorized" } };
    const b = (body ?? {}) as { txHash?: unknown; returnId?: unknown; deadline?: unknown };
    if (typeof b.txHash !== "string" || typeof b.returnId !== "string" || typeof b.deadline !== "number") {
      return { status: 400, body: { error: "invalid_input" } };
    }
    const now = deps.nowSec();
    const result = await createReturnAttestation({
      txHash: b.txHash,
      returnId: b.returnId,
      signer: deps.signer,
      burnAddress: config.burnAddress,
      hubAddress: config.hubAddress,
      hubChainId: config.hubChainId,
      nowSec: now,
      deadlineSec: b.deadline,
      getReceipt: deps.getReceipt,
      headBlock: deps.headBlock,
      finalizedBlock: deps.finalizedBlock,
      returnVerifier: deps.returnCosigner,
    });
    if (!result.ok) return { status: result.status, body: { error: (result as AttestationFailure).error } };

    const id = result.body.returnId.toLowerCase();
    const ppl = BigInt(result.body.pplAmount);
    const total = hourTotal(now);
    const already = signed.has(id);
    const after = already ? total : total + ppl;
    if (after > config.maxPplPerHour) {
      await safeAlert(
        `PPL sell-back brake: refused to cosign ${result.body.returnId} (${fmt(ppl)} PPL). ` +
          `Cosigned in the last hour: ${fmt(total)} PPL, limit ${fmt(config.maxPplPerHour)}. ` +
          `If this is an attack, pause the hub from the Safe.`,
      );
      return { status: 429, body: { error: "hourly_limit" } };
    }
    if (!already) signed.set(id, { at: now, ppl });
    if (after > config.warnPplPerHour && now - lastWarnAt > HOUR / 4) {
      lastWarnAt = now;
      await safeAlert(
        `PPL sell-back alert: ${fmt(after)} PPL cosigned in the last hour ` +
          `(warning at ${fmt(config.warnPplPerHour)}, hard stop at ${fmt(config.maxPplPerHour)}).`,
      );
    }
    return { status: 200, body: { signature: result.body.signature } };
  }

  async function safeAlert(text: string) {
    try {
      await deps.alert(text);
    } catch {
      // An alert failure must not change the signing decision.
    }
  }

  return { handle, hourTotal: () => hourTotal(deps.nowSec()) };
}

function fmt(wei: bigint): string {
  return (wei / BigInt(10) ** BigInt(18)).toString();
}

/** Telegram alert sender; a no-op when the bot token or chat id is missing. */
export function telegramAlert(token: string | undefined, chatId: string | undefined) {
  return async (text: string) => {
    if (!token || !chatId) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    });
  };
}
