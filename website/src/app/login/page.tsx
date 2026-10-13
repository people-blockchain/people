import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { SignedInRedirect } from "./SignedInRedirect";
import { isAuthConfigured, isGoogleConfigured, isResendConfigured } from "@/lib/partner/guards";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in | People",
  description: "Sign in with Google or email for your People Wallet and partner cabinet.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Sign in | People",
    siteName: SITE_NAME,
  },
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; b64Params?: string; sessionId?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <Suspense fallback={null}>
        <SignedInRedirect callbackUrl={params.callbackUrl} error={params.error} searchParams={params} />
      </Suspense>
      <LoginForm
        callbackUrl={params.callbackUrl ?? "/wallet"}
        errorCode={params.error}
        configured={isAuthConfigured()}
        googleEnabled={isGoogleConfigured()}
        magicEnabled={isResendConfigured()}
      />
    </>
  );
}
