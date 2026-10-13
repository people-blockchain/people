import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAuthConfigured, partnerHomeAfterLogin, withWalletConnectFlag } from "@/lib/partner/guards";
import { partnerUserExists } from "@/lib/partner/service";
import { hasWeb3AuthRedirectResultInParams } from "@/lib/web3auth-redirect-resume";

/** Runs in Suspense so the login shell can stream without blocking on auth/DB. */
export async function SignedInRedirect({
  callbackUrl,
  error,
  searchParams,
}: {
  callbackUrl?: string;
  error?: string;
  /**
   * A mobile Web3Auth redirect lands here carrying its own result (`b64Params`/`sessionId`),
   * which the client must consume to finish signing in and to navigate back to the page the
   * attempt started on (e.g. `/founders?ref=...`). An already-signed-in visitor (a returning
   * founder testing again) must not be bounced away before that client-side resume runs — that
   * silently drops the pending sign-in and strands the person on `/wallet` instead of back
   * where they started.
   */
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (!isAuthConfigured() || error) return null;
  if (searchParams && hasWeb3AuthRedirectResultInParams(searchParams)) return null;
  let signedIn = false;
  try {
    const session = await auth();
    signedIn = Boolean(session?.user?.id && (await partnerUserExists(session.user.id)));
  } catch (err) {
    console.error(
      "[login] session check failed",
      err instanceof Error ? err.name : typeof err,
    );
  }
  // Must run outside the try/catch: `redirect()` signals via a thrown control-flow
  // error, so catching it here would swallow the redirect entirely.
  if (signedIn) redirect(withWalletConnectFlag(partnerHomeAfterLogin(callbackUrl)));
  return null;
}
