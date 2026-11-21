import { readTurnkeyApiBaseUrl } from "@/lib/turnkey-config";
import { sanitizeTurnkeyError } from "@/lib/turnkey-error";
import type { ClientStampedActivity } from "@/lib/turnkey-stamp";

export class TurnkeyRelayError extends Error {
  readonly turnkeyCode: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TurnkeyRelayError";
    this.turnkeyCode = code;
  }
}

export type TurnkeyFetch = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/**
 * Forward a browser-stamped Turnkey activity. Does not attach the parent org API key.
 */
export async function forwardStampedTurnkeyActivity(input: {
  path: string;
  stamped: ClientStampedActivity;
  apiBaseUrl?: string;
  fetchImpl?: TurnkeyFetch;
}): Promise<unknown> {
  if (!input.path.startsWith("/public/v1/submit/")) throw new Error("invalid_stamp");
  const apiBaseUrl = (input.apiBaseUrl ?? readTurnkeyApiBaseUrl()).replace(/\/+$/, "");
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch as TurnkeyFetch);
  const url = `${apiBaseUrl}${input.path}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Stamp": input.stamped.stamp,
    },
    body: input.stamped.stampedBody,
  });
  const payload = await res.json().catch(async () => {
    const text = await res.text().catch(() => "");
    return text ? { message: text } : {};
  });
  if (!res.ok) {
    const sanitized = sanitizeTurnkeyError(payload);
    throw new TurnkeyRelayError(sanitized.code, sanitized.message);
  }
  return payload;
}
