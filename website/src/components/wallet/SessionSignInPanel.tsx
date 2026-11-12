"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { useLanguage } from "@/context/LanguageContext";
import { partnerCopy } from "@/lib/partner/copy";
import { readLastAuthEmail, rememberAuthEmail } from "@/lib/wallet-auth-storage";

/**
 * Session-only Auth.js sign-in for the partner cabinet.
 *
 * Google and Resend Magic Link produce an Auth.js session only. This panel must
 * never create, sync, or prompt for a custodial cloud-vault wallet and must not
 * load Web3Auth. Wallet options live in the local-wallet block below /login.
 */
export function SessionSignInPanel({
  redirectTo,
  googleEnabled,
  magicEnabled,
  showAgreement = false,
}: {
  redirectTo: string;
  googleEnabled: boolean;
  magicEnabled: boolean;
  showAgreement?: boolean;
}) {
  const { lang } = useLanguage();
  const t = partnerCopy[lang];
  const [pending, setPending] = useState<"google" | "email" | null>(null);
  const [knownEmail] = useState(() => readLastAuthEmail());

  const continueWithGoogle = () => {
    setPending("google");
    // UX extra only: start the provider flow from a clean session. The server still drops a
    // stale JWT on the OAuth callback when the new identity has a different email, so this is
    // never the enforcement point (see auth-session-identity.ts).
    void signOut({ redirect: false })
      .catch(() => undefined)
      .then(() => signIn("google", { redirectTo }));
  };

  return (
    <div className="space-y-4" data-testid="session-sign-in">
      <div>
        <h2 className="text-base font-bold text-ink">{t.sessionSignInHeading}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{t.sessionSignInLead}</p>
      </div>

      {googleEnabled ? (
        <button
          type="button"
          disabled={pending !== null}
          data-testid="session-sign-in-google"
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40"
          onClick={continueWithGoogle}
        >
          {t.googleCta}
        </button>
      ) : null}

      {googleEnabled && magicEnabled ? (
        <p className="text-center text-xs uppercase tracking-[0.14em] text-ink-3">{t.or}</p>
      ) : null}

      {magicEnabled ? (
        <form
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
            if (!email) return;
            rememberAuthEmail(email);
            setPending("email");
            await signOut({ redirect: false }).catch(() => undefined);
            await signIn("resend", { email, redirectTo });
          }}
        >
          <label className="block text-sm text-ink-2" htmlFor="session-sign-in-email-input">
            {t.emailLabel}
          </label>
          <input
            id="session-sign-in-email-input"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={knownEmail ?? ""}
            placeholder={t.emailPlaceholder}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            disabled={pending !== null}
          />
          <button
            type="submit"
            disabled={pending !== null}
            data-testid="session-sign-in-email"
            className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            {t.magicCta}
          </button>
        </form>
      ) : null}

      {showAgreement ? (
        <p className="text-center text-xs leading-relaxed text-ink-3">
          {t.signInAgreementBefore}
          <Link href="/terms" className="text-brand hover:underline">
            {t.signInTermsLink}
          </Link>
          {t.signInAgreementAnd}
          <Link href="/privacy" className="text-brand hover:underline">
            {t.signInPrivacyLink}
          </Link>
          {t.signInAgreementAfter}
        </p>
      ) : null}
    </div>
  );
}
