import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    /** Epoch ms the user last actually signed in (set once at sign-in, not refreshed by session reads). */
    authTime?: number;
    /** Auth.js provider id this session signed in with (e.g. "google", "resend", "web3auth"). */
    provider?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authTime?: number;
    /** Set from `account.provider` on the sign-in that created this token. */
    provider?: string;
  }
}
