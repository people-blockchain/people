const LAST_AUTH_EMAIL_KEY = "ppl_last_auth_email";
const LAST_AUTH_METHOD_KEY = "ppl_last_auth_method";

export type LastAuthMethod = "google" | "email_passwordless";

export function readLastAuthEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(LAST_AUTH_EMAIL_KEY)?.trim();
    return value && value.includes("@") ? value : null;
  } catch {
    return null;
  }
}

export function rememberAuthEmail(email: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const normalized = email?.trim();
  if (!normalized || !normalized.includes("@")) return;
  try {
    localStorage.setItem(LAST_AUTH_EMAIL_KEY, normalized);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Last Web3Auth loginProvider used in this browser. Defaults to Google (primary). */
export function readLastAuthMethod(): LastAuthMethod {
  if (typeof window === "undefined") return "google";
  try {
    const value = localStorage.getItem(LAST_AUTH_METHOD_KEY)?.trim();
    if (value === "email_passwordless") return "email_passwordless";
    return "google";
  } catch {
    return "google";
  }
}

export function rememberAuthMethod(method: LastAuthMethod): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_AUTH_METHOD_KEY, method);
  } catch {
    /* ignore */
  }
}

export function formatContinueAsLabel(template: string, email: string): string {
  return template.replace("{email}", email);
}
