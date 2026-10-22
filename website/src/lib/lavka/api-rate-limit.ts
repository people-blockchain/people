import { checkSharedRateLimit } from "@/lib/api-rate-limit";

/**
 * The Lavka verify routes (redeem/escrow/programs/merchant) each trigger at least one upstream
 * chain RPC call (receipt/eth_call), so a verified human must not be able to amplify load onto
 * the single node the site depends on (LAV-M5). Keyed on the authenticated user id, not the
 * client IP, and shared across all four routes so the budget reflects total RPC cost.
 */
const LAVKA_RATE_NAMESPACE = "lavka-api";
const LAVKA_RATE_MAX_PER_WINDOW = 30;
const LAVKA_RATE_WINDOW_MS = 60_000;

export function lavkaRateLimitAllowed(userId: string): Promise<boolean> {
  return checkSharedRateLimit(
    LAVKA_RATE_NAMESPACE,
    userId,
    LAVKA_RATE_MAX_PER_WINDOW,
    LAVKA_RATE_WINDOW_MS
  );
}
