import { getAddress, isAddress } from "viem";
import {
  readFoundersHumanPassportConfig,
  type FoundersHumanPassportConfig,
} from "./human-passport-config.ts";
import { VERIFICATION_LEVEL_STRONG } from "./verification.ts";

export type HumanPassportVerifyResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_configured"
        | "not_registered"
        | "invalid_credential"
        | "wallet_not_linked"
        | "wallet_mismatch"
        | "score_too_low"
        | "verification_failed";
      score?: number;
      threshold?: number;
      address?: string;
      walletKind?: "passport" | "primary";
    };

/** Row from the `founders` table (not `partners`). */
export type HumanPassportFounderRecord = {
  walletAddress: string | null;
  /** Separate wallet linked for Human Passport; scored instead of walletAddress when set. */
  passportWallet: string | null;
  verificationLevel: number;
};

/** I/O boundary: DB access and Passport HTTP are injected so the rules stay testable. */
export type HumanPassportVerifyDeps = {
  loadFounder: (userId: string) => Promise<HumanPassportFounderRecord | null>;
  applyStrongVerification: (userId: string) => Promise<void>;
  fetch: typeof fetch;
  readConfig?: () => FoundersHumanPassportConfig | null;
};

type PassportScoreResponse = {
  address?: string;
  score?: string | number;
  passing_score?: boolean;
  threshold?: string | number;
  error?: string | null;
};

function parseScore(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Scores the wallet linked to this founder (`founders.walletAddress`) and, on pass,
 * grants level 2. The address is taken from the server; an optional client
 * `credential` is accepted only if it equals the linked wallet (checksum compare).
 */
export async function verifyHumanPassportForUser(
  userId: string,
  credential: string | undefined,
  deps: HumanPassportVerifyDeps,
): Promise<HumanPassportVerifyResult> {
  const config = (deps.readConfig ?? readFoundersHumanPassportConfig)();
  if (!config) return { ok: false, error: "not_configured" };

  const founder = await deps.loadFounder(userId);
  if (!founder) return { ok: false, error: "not_registered" };

  if (founder.verificationLevel >= VERIFICATION_LEVEL_STRONG) {
    return { ok: true };
  }

  let requested: string | null = null;
  const trimmed = credential?.trim();
  if (trimmed) {
    if (!isAddress(trimmed)) {
      return { ok: false, error: "invalid_credential" };
    }
    requested = getAddress(trimmed);
  }

  const passportLinked = founder.passportWallet?.trim();
  const walletKind: "passport" | "primary" =
    passportLinked && isAddress(passportLinked, { strict: false }) ? "passport" : "primary";
  const linked = walletKind === "passport" ? passportLinked : founder.walletAddress?.trim();
  if (!linked || !isAddress(linked, { strict: false })) {
    return { ok: false, error: "wallet_not_linked" };
  }
  const address = getAddress(linked);

  if (requested !== null && requested !== address) {
    return { ok: false, error: "wallet_mismatch" };
  }

  const url = `https://api.passport.xyz/v2/stamps/${encodeURIComponent(config.scorerId)}/score/${address}`;
  let response: Response;
  try {
    response = await deps.fetch(url, {
      headers: { "X-API-KEY": config.apiKey },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "verification_failed" };
  }

  if (!response.ok) {
    return { ok: false, error: "verification_failed" };
  }

  const data = (await response.json()) as PassportScoreResponse;
  if (data.error) {
    return { ok: false, error: "verification_failed" };
  }
  if (data.address && (!isAddress(data.address, { strict: false }) || getAddress(data.address) !== address)) {
    return { ok: false, error: "verification_failed" };
  }

  const score = parseScore(data.score);
  if (score === null) {
    return { ok: false, error: "verification_failed" };
  }

  const threshold = parseScore(data.threshold) ?? config.minScore;
  const minRequired = Math.max(config.minScore, threshold);
  const passing =
    data.passing_score === true || score >= minRequired;

  if (!passing) {
    return { ok: false, error: "score_too_low", score, threshold: minRequired, address, walletKind };
  }

  await deps.applyStrongVerification(userId);
  return { ok: true };
}
