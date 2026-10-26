import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { headers } from "next/headers";
import { renderMagicLinkEmail, resolveMagicLinkLocale } from "@/lib/partner/email";
import { resolvePostAuthRedirectUrl } from "@/lib/partner/guards";
import { logAuthError } from "@/lib/partner/auth-errors";
import { SITE_URL } from "@/lib/site";
import { readWeb3AuthClientId } from "@/lib/web3auth-config";
import { authorizeWeb3AuthIdToken } from "@/lib/web3auth-auth";
import { blocksDangerousAccountLink } from "@/lib/wallet-link-guard";

/** Shared by Route Handlers and Proxy so JWT cookies encode/decode with the same secret. */
const BUILD_PLACEHOLDER_SECRET = "people-partner-build-placeholder-not-for-production";

/**
 * The placeholder secret is only acceptable while building (when config is evaluated to
 * collect page data) or under test. At runtime in production a missing AUTH_SECRET means
 * JWT cookies would be signed with a public constant — fail loudly instead.
 */
function resolveAuthSecret(): string {
  const explicit = process.env.AUTH_SECRET?.trim();
  if (explicit) return explicit;
  const buildOrTest =
    process.env.NODE_ENV === "test" || process.env.NEXT_PHASE === "phase-production-build";
  if (!buildOrTest) {
    throw new Error(
      "AUTH_SECRET is required at runtime. Refusing to use the build placeholder secret in production.",
    );
  }
  return BUILD_PLACEHOLDER_SECRET;
}

const authSecret = resolveAuthSecret();

const googleId = process.env.AUTH_GOOGLE_ID?.trim();
const googleSecret = process.env.AUTH_GOOGLE_SECRET?.trim();
const resendKey = process.env.AUTH_RESEND_KEY?.trim();
const emailFrom =
  process.env.AUTH_EMAIL_FROM?.trim() || "PEOPLE <noreply@peopleblockchain.network>";

const providers: NextAuthConfig["providers"] = [];

if (googleId && googleSecret) {
  providers.push(
    Google({
      clientId: googleId,
      clientSecret: googleSecret,
      // Linking by email is only safe for Google-verified addresses; an unverified
      // Google email must never be allowed to take over an existing account.
      allowDangerousEmailAccountLinking: true,
      profile(profile) {
        if (profile.email_verified !== true) {
          throw new Error("Google account email is not verified");
        }
        return {
          id: profile.sub,
          name: profile.name ?? profile.email.split("@")[0],
          email: profile.email,
          image: profile.picture,
        };
      },
    }),
  );
}

if (resendKey) {
  providers.push(
    Resend({
      apiKey: resendKey,
      from: emailFrom,
      maxAge: 60 * 15,
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        const host = new URL(SITE_URL).host;
        const acceptLanguage = (await headers()).get("accept-language");
        const locale = resolveMagicLinkLocale(acceptLanguage);
        const mail = renderMagicLinkEmail({ url, host, locale });
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`Resend failed: ${response.status} ${detail}`);
        }
      },
    }),
  );
}

if (readWeb3AuthClientId()) {
  providers.push(
    Credentials({
      id: "web3auth",
      name: "Web3Auth",
      credentials: {
        idToken: { label: "ID Token", type: "text" },
      },
      authorize: async (credentials) => {
        const idToken = credentials?.idToken;
        if (!idToken || typeof idToken !== "string") return null;
        try {
          return await authorizeWeb3AuthIdToken(idToken);
        } catch {
          return null;
        }
      },
    }),
  );
}

export const authConfig = {
  trustHost: true,
  secret: authSecret,
  logger: {
    error: logAuthError,
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    // Auth.js appends `?error=<code>`; the login page must render it (do not use `/`).
    error: "/login",
  },
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    async redirect({ url, baseUrl }) {
      return resolvePostAuthRedirectUrl(url, baseUrl);
    },
    // recon.md R2 / wallet-sessions.md #1: refuse to let a *new* OAuth provider link attach
    // to an existing account that already owns a cloud wallet. Runs before any account
    // linking/creation (see @auth/core handleAuthorized → handleLoginOrRegister), so returning
    // false here stops the link from ever being created.
    async signIn({ account, profile }) {
      if (account?.type === "oauth" && typeof profile?.email === "string") {
        const blocked = await blocksDangerousAccountLink({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email: profile.email,
        });
        if (blocked) return false;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user?.id) {
        token.sub = user.id;
        // Set once, at actual sign-in, so a reauth check can't be satisfied by a long-lived
        // session that merely keeps getting refreshed without the user signing in again.
        token.authTime = Date.now();
      }
      // api-cron.md M1: record which provider authenticated this session. `account` is only
      // present on the sign-in that creates the token; later session reads keep the value.
      if (typeof account?.provider === "string" && account.provider) {
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      if (typeof token.authTime === "number") {
        session.authTime = token.authTime;
      }
      if (typeof token.provider === "string") {
        session.provider = token.provider;
      }
      return session;
    },
  },
  theme: {
    brandColor: "#38bdf8",
    logo: `${SITE_URL}/brand/icon-192.png`,
    colorScheme: "dark",
  },
} satisfies NextAuthConfig;
