/**
 * Sanitize Turnkey / SDK failures for logs. Never emit keys, stamps, bundles, or ciphertext.
 */

const SECRETISH =
  /(?:-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----)|(?:\b[0-9a-fA-F]{32,}\b)|(?:[A-Za-z0-9+/_-]{80,}={0,2})/g;

const CODE_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,80}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function sanitizeTurnkeyLogText(value: string, max = 240): string {
  const cleaned = value.replace(SECRETISH, "[redacted]").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}…`;
}

function codeFromUnknown(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return `turnkey_${Math.trunc(value)}`;
  const text = asString(value);
  if (!text) return undefined;
  if (CODE_RE.test(text)) return text;
  const grpc = text.match(/\bcode\s*=\s*([A-Za-z][A-Za-z0-9_]+)/);
  if (grpc?.[1] && CODE_RE.test(grpc[1])) return grpc[1];
  const quoted = text.match(/\bcode['"]?\s*[:=]\s*['"]([A-Za-z][A-Za-z0-9_.-]+)['"]/);
  if (quoted?.[1] && CODE_RE.test(quoted[1])) return quoted[1];
  return undefined;
}

function messageFromUnknown(value: unknown): string | undefined {
  return asString(value);
}

function preferCode(...candidates: Array<string | undefined>): string | undefined {
  const named = candidates.find((item) => item && !/^turnkey_\d+$/.test(item));
  return named ?? candidates.find((item) => Boolean(item));
}

function readNestedError(err: unknown): { code?: string; message?: string } {
  const rec = asRecord(err);
  if (!rec) {
    if (typeof err === "string") return { message: err };
    return {};
  }
  const nested =
    asRecord(rec.error) ??
    asRecord(rec.data) ??
    asRecord(rec.details) ??
    asRecord(Array.isArray(rec.details) ? rec.details[0] : null);
  const cause = rec.cause;
  const fromNested = nested ? readNestedError(nested) : {};
  const fromCause = cause && cause !== err ? readNestedError(cause) : {};
  const message =
    messageFromUnknown(rec.message) ??
    messageFromUnknown(rec.errorMessage) ??
    fromNested.message ??
    fromCause.message;
  return {
    code: preferCode(
      codeFromUnknown(rec.turnkeyErrorCode),
      codeFromUnknown(rec.turnkeyCode),
      codeFromUnknown(rec.errorCode),
      fromNested.code,
      fromCause.code,
      codeFromUnknown(message),
      codeFromUnknown(rec.code),
    ),
    message,
  };
}

export function sanitizeTurnkeyError(err: unknown): { code: string; message: string } {
  const extracted = readNestedError(err);
  let message = extracted.message ?? (err instanceof Error ? err.message : "");
  if (!extracted.code && message) {
    try {
      const parsed = JSON.parse(message) as unknown;
      const fromJson = readNestedError(parsed);
      if (fromJson.code) extracted.code = fromJson.code;
      if (fromJson.message) message = fromJson.message;
    } catch {
      /* message is not JSON */
    }
  }
  const code =
    preferCode(extracted.code, codeFromUnknown(message)) ?? (message ? "turnkey_error" : "turnkey_failed");
  const safeMessage = sanitizeTurnkeyLogText(message || code);
  return { code: CODE_RE.test(code) ? code : "turnkey_error", message: safeMessage };
}
