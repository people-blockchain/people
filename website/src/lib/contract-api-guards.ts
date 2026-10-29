export const MAX_CONTRACT_SOURCE_BYTES = 64 * 1024;
export const MAX_CONTRACT_PROMPT_BYTES = 8 * 1024;
export const CONTRACT_COMPILE_RATE_PER_MIN = 20;
/** Per-IP cap is looser than per-user: many users can share one NAT or the "unknown" bucket. */
export const CONTRACT_COMPILE_IP_RATE_PER_MIN = 60;
export const CONTRACT_COMPOSE_RATE_PER_MIN = 15;
export const CONTRACT_COMPILE_TIMEOUT_MS = 25_000;

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function sourceWithinLimit(source: string, maxBytes = MAX_CONTRACT_SOURCE_BYTES): boolean {
  return utf8ByteLength(source) <= maxBytes;
}
