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
    /** Epoch ms of the last provider sign-in. Session reads and client update() do not move it. */
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
