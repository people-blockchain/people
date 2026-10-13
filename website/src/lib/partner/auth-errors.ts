import type { PartnerStrings } from "./copy";

type AuthErrorCopy = Pick<
  PartnerStrings,
  | "authErrorDefault"
  | "authErrorConfiguration"
  | "authErrorAccessDenied"
  | "authErrorVerification"
  | "authErrorOAuth"
  | "authErrorCreateAccount"
  | "authErrorAccountNotLinked"
  | "authErrorEmailSignin"
  | "authErrorSessionExpired"
  | "authErrorUnavailable"
>;

const OAUTH_CODES = new Set([
  "OAuthSignin",
  "OAuthCallback",
  "OAuthAccountNotLinked",
  "Callback",
]);

const CREATE_ACCOUNT_CODES = new Set(["OAuthCreateAccount", "EmailCreateAccount"]);

/** Map Auth.js `?error=` codes to a locale string. Unknown codes use the default. */
export function authErrorMessage(code: string | null | undefined, t: AuthErrorCopy): string | null {
  const key = code?.trim();
  if (!key) return null;
  if (key === "SessionExpired") return t.authErrorSessionExpired;
  if (key === "Unavailable") return t.authErrorUnavailable;
  if (key === "Configuration") return t.authErrorConfiguration;
  if (key === "AccessDenied") return t.authErrorAccessDenied;
  if (key === "Verification") return t.authErrorVerification;
  if (key === "EmailSignin") return t.authErrorEmailSignin;
  if (key === "OAuthAccountNotLinked") return t.authErrorAccountNotLinked;
  if (CREATE_ACCOUNT_CODES.has(key)) return t.authErrorCreateAccount;
  if (OAUTH_CODES.has(key)) return t.authErrorOAuth;
  return t.authErrorDefault;
}

/** Server-side Auth.js logger: names only, never tokens/URLs/secrets. */
export function logAuthError(error: Error): void {
  const name =
    "type" in error && typeof (error as { type?: unknown }).type === "string"
      ? (error as { type: string }).type
      : error.name;
  const cause = error.cause;
  let causeName: string | undefined;
  if (cause instanceof Error) {
    causeName = cause.name;
  } else if (cause && typeof cause === "object" && "err" in cause) {
    const inner = (cause as { err?: unknown }).err;
    if (inner instanceof Error) causeName = inner.name;
  }
  console.error("[auth]", name, causeName ?? "");
}

export function logAdapterError(method: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const causeName =
    error instanceof Error && error.cause instanceof Error ? error.cause.name : undefined;
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  console.error("[auth.adapter]", method, name, causeName ?? "", code ?? "");
}
