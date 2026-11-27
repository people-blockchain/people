import type { IDKitResult } from "@worldcoin/idkit";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founderWorldIdNonces, founderWorldIdNullifiers, founders } from "@/db/schema";
import { FOUNDERS_WORLD_ID_EXPECTED_ENV, readFoundersWorldIdConfig } from "./world-id-config.ts";
import { nullifierHexToDecimal } from "./world-id-nullifier.ts";
import { VERIFICATION_LEVEL_STRONG } from "./verification.ts";
import { getFounderVerificationLevel } from "./verification-service.ts";

export type WorldIdVerifyResult =
  | { ok: true }
  | { ok: false; error: "not_configured" | "invalid_proof" | "nullifier_used" | "verification_failed" };

export async function verifyWorldIdProofForUser(
  userId: string,
  idkitResponse: IDKitResult,
): Promise<WorldIdVerifyResult> {
  const config = readFoundersWorldIdConfig();
  if (!config) return { ok: false, error: "not_configured" };

  const currentLevel = await getFounderVerificationLevel(userId);
  if (currentLevel >= VERIFICATION_LEVEL_STRONG) {
    return { ok: true };
  }

  if (idkitResponse?.environment !== FOUNDERS_WORLD_ID_EXPECTED_ENV) {
    return { ok: false, error: "verification_failed" };
  }
  const proofAction =
    "action" in idkitResponse && typeof idkitResponse.action === "string"
      ? idkitResponse.action
      : null;
  if (proofAction !== config.action) {
    return { ok: false, error: "verification_failed" };
  }

  const nonce =
    "nonce" in idkitResponse && typeof idkitResponse.nonce === "string" && idkitResponse.nonce.trim()
      ? idkitResponse.nonce.trim()
      : null;
  if (!nonce) {
    return { ok: false, error: "invalid_proof" };
  }

  const responseRow = idkitResponse.responses?.[0];
  const identifier =
    responseRow && "identifier" in responseRow && typeof responseRow.identifier === "string"
      ? responseRow.identifier
      : null;
  if (identifier !== "orb") {
    return { ok: false, error: "invalid_proof" };
  }

  const db = await getDbReady();
  const now = new Date();
  const nonceRows = await db
    .update(founderWorldIdNonces)
    .set({ usedAt: now })
    .where(
      and(
        eq(founderWorldIdNonces.nonce, nonce),
        eq(founderWorldIdNonces.userId, userId),
        eq(founderWorldIdNonces.action, config.action),
        isNull(founderWorldIdNonces.usedAt),
        gt(founderWorldIdNonces.expiresAt, now),
      ),
    )
    .returning({ nonce: founderWorldIdNonces.nonce });
  if (nonceRows.length === 0) {
    return { ok: false, error: "verification_failed" };
  }

  const verifyRes = await fetch(`https://developer.world.org/api/v4/verify/${config.rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...idkitResponse,
      environment: FOUNDERS_WORLD_ID_EXPECTED_ENV,
    }),
  });
  if (!verifyRes.ok) {
    return { ok: false, error: "verification_failed" };
  }
  const verification = (await verifyRes.json()) as { success?: boolean; environment?: string };
  if (verification.success !== true || verification.environment !== FOUNDERS_WORLD_ID_EXPECTED_ENV) {
    return { ok: false, error: "verification_failed" };
  }

  const nullifierHex =
    responseRow && "nullifier" in responseRow && typeof responseRow.nullifier === "string"
      ? responseRow.nullifier
      : null;
  if (!nullifierHex) {
    return { ok: false, error: "invalid_proof" };
  }

  let nullifierDecimal: string;
  try {
    nullifierDecimal = nullifierHexToDecimal(nullifierHex);
  } catch {
    return { ok: false, error: "invalid_proof" };
  }

  try {
    // The unique nullifier row is claimed and the level upgrade only happens if this
    // transaction won the insert. A parallel submission of the same nullifier from another
    // account blocks on the unique index, sees an empty insert, and is rejected — so one
    // nullifier can never upgrade more than one founder to level 2.
    const result = await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(founderWorldIdNullifiers)
        .values({
          nullifier: nullifierDecimal,
          action: config.action,
          userId,
        })
        .onConflictDoNothing()
        .returning({ userId: founderWorldIdNullifiers.userId });
      if (claimed.length === 0) {
        const owner = await tx
          .select({ userId: founderWorldIdNullifiers.userId })
          .from(founderWorldIdNullifiers)
          .where(
            and(
              eq(founderWorldIdNullifiers.nullifier, nullifierDecimal),
              eq(founderWorldIdNullifiers.action, config.action),
            ),
          )
          .limit(1);
        if (owner[0] && owner[0].userId !== userId) {
          return { ok: false as const, error: "nullifier_used" as const };
        }
        return { ok: true as const };
      }
      await tx
        .update(founders)
        .set({ verificationLevel: VERIFICATION_LEVEL_STRONG, verifiedAt: new Date() })
        .where(eq(founders.userId, userId));
      return { ok: true as const };
    });
    return result;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      return { ok: false, error: "nullifier_used" };
    }
    throw err;
  }
}
