import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { factoryIconPaymentTxs } from "@/db/schema";
import { readIconGenPaidFeePpl, iconFeeRecipientAddress } from "./factory-icon-config.ts";
import { getNodeRpcUrl } from "./factory-config.ts";

type TxBody = {
  id?: string;
  type?: string;
  from?: string;
  to?: string;
  amount?: number;
  fee?: number;
  timestamp?: number;
  blockHeight?: number;
  finalized?: boolean;
  validatorConfirmations?: number;
};

/** A payment older than this is rejected even if valid on-chain (stale id reuse / probing). */
export const DEFAULT_ICON_GEN_PAYMENT_MAX_AGE_MS = 30 * 60 * 1000;
/** Accepted clock skew when the tx `timestamp` looks "in the future" relative to our clock. */
export const ICON_GEN_PAYMENT_CLOCK_SKEW_MS = 5 * 60 * 1000;
/**
 * api-cron.md M2: the primary finality gate is the node's `finalized` flag; this is a tunable
 * floor on top of it. Default 1 so a payment in the just-finalized head block is accepted.
 */
export const DEFAULT_ICON_GEN_PAYMENT_MIN_CONFIRMATIONS = 1;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function iconPaymentMaxAgeMs(): number {
  return readPositiveIntEnv("ICON_GEN_PAYMENT_TX_MAX_AGE_MS", DEFAULT_ICON_GEN_PAYMENT_MAX_AGE_MS);
}

export function iconPaymentMinConfirmations(): number {
  return readPositiveIntEnv(
    "ICON_GEN_PAYMENT_MIN_CONFIRMATIONS",
    DEFAULT_ICON_GEN_PAYMENT_MIN_CONFIRMATIONS
  );
}

/**
 * Verify a payment for one AI-icon batch. Reads the tx from the node's `/transactions/:id`
 * endpoint (the old `/tx/:id` path 404s, so the paid path never worked) and requires:
 *   - the right type/sender/recipient/amount,
 *   - a recent `timestamp`,
 *   - inclusion in a block (`blockHeight > 0`),
 *   - the node marking it `finalized`, plus a minimum confirmations floor.
 */
export async function verifyIconGenPaymentTx(
  paymentTxId: string,
  expectedFrom: string
): Promise<{ ok: true } | { ok: false; code: string }> {
  const recipient = iconFeeRecipientAddress();
  if (!recipient) {
    return { ok: false, code: "fee_recipient_unconfigured" };
  }
  const base = getNodeRpcUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/transactions/${encodeURIComponent(paymentTxId)}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "payment_tx_lookup_failed" };
  }
  if (!res.ok) {
    return { ok: false, code: "payment_tx_not_found" };
  }
  const tx = (await res.json().catch(() => null)) as TxBody | null;
  if (!tx) {
    return { ok: false, code: "payment_tx_not_found" };
  }
  if (tx.type !== "transfer") {
    return { ok: false, code: "payment_tx_wrong_type" };
  }
  if ((tx.from ?? "").toLowerCase() !== expectedFrom.trim().toLowerCase()) {
    return { ok: false, code: "payment_tx_wrong_sender" };
  }
  if ((tx.to ?? "").toLowerCase() !== recipient.toLowerCase()) {
    return { ok: false, code: "payment_tx_wrong_recipient" };
  }
  const fee = readIconGenPaidFeePpl();
  if (typeof tx.amount !== "number" || tx.amount < fee) {
    return { ok: false, code: "payment_tx_amount_low" };
  }
  if (typeof tx.timestamp !== "number" || !Number.isFinite(tx.timestamp)) {
    return { ok: false, code: "payment_tx_missing_timestamp" };
  }
  const age = Date.now() - tx.timestamp;
  if (age > iconPaymentMaxAgeMs()) {
    return { ok: false, code: "payment_tx_too_old" };
  }
  if (age < -ICON_GEN_PAYMENT_CLOCK_SKEW_MS) {
    return { ok: false, code: "payment_tx_from_future" };
  }
  if (typeof tx.blockHeight !== "number" || tx.blockHeight <= 0) {
    return { ok: false, code: "payment_tx_unconfirmed" };
  }
  if (tx.finalized !== true) {
    return { ok: false, code: "payment_tx_not_finalized" };
  }
  const confirmations = await iconPaymentConfirmations(base, tx.blockHeight);
  if (confirmations === null) {
    return { ok: false, code: "payment_tx_head_unavailable" };
  }
  if (confirmations < iconPaymentMinConfirmations()) {
    return { ok: false, code: "payment_tx_insufficient_confirmations" };
  }
  return { ok: true };
}

/** `head.height - blockHeight + 1`, or null when the head endpoint is unavailable. */
async function iconPaymentConfirmations(base: string, blockHeight: number): Promise<number | null> {
  try {
    const res = await fetch(`${base}/chain/head`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { height?: number } | null;
    if (!body || typeof body.height !== "number" || body.height < blockHeight) return null;
    return body.height - blockHeight + 1;
  } catch {
    return null;
  }
}

/**
 * Postgres unique-violation (SQLSTATE 23505) anywhere in the error's `cause` chain. Drizzle
 * wraps driver errors in its own `DrizzleQueryError` ("Failed query: ..."), so checking only the
 * top-level error would let a replayed payment surface as a 500 instead of "already used".
 */
function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth += 1) {
    const code = (current as { code?: unknown } | null)?.code;
    if (code === "23505") return true;
    const message = current instanceof Error ? current.message : String(current);
    if (/duplicate key|unique constraint|23505/i.test(message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Atomically claim a payment tx for a single generation batch. Insert-on-claim with a unique
 * index on `paymentTxId` means the same on-chain payment cannot be replayed for unlimited
 * icons across instances or after a cold start; a unique violation means "already used".
 */
export async function claimIconGenPaymentTx(
  paymentTxId: string,
  walletAddress: string,
  dayKey: string
): Promise<boolean> {
  const key = paymentTxId.trim().toLowerCase();
  if (!key) return false;
  const db = await getDbReady();
  try {
    await db.insert(factoryIconPaymentTxs).values({
      paymentTxId: key,
      walletAddress: walletAddress.trim().toLowerCase(),
      dayKey,
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/** Return a claimed tx to the pool when generation failed before delivering variants. */
export async function releaseIconGenPaymentTx(paymentTxId: string): Promise<void> {
  const key = paymentTxId.trim().toLowerCase();
  if (!key) return;
  try {
    const db = await getDbReady();
    await db.delete(factoryIconPaymentTxs).where(eq(factoryIconPaymentTxs.paymentTxId, key));
  } catch (error) {
    // Must not mask the original generation error the caller is already handling.
    console.warn(
      "[factory-icon] failed to release payment tx",
      error instanceof Error ? error.message : error
    );
  }
}
