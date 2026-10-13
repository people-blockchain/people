import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { PartnerCabinet } from "@/components/partner/PartnerCabinet";
import { isAuthConfigured } from "@/lib/partner/guards";
import {
  attachReferralIfEligible,
  linkPartnerWalletFromVaultIfAbsent,
  loadCabinet,
  partnerUserExists,
} from "@/lib/partner/service";
import { fetchAccountView, fetchGrowthClaims } from "@/lib/partner/protocol";
import { partnerSharePath, REFERRAL_COOKIE } from "@/lib/partner/referral";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Partner cabinet | People",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PartnerPage() {
  if (!isAuthConfigured()) {
    redirect("/login");
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/partner");
  }
  // A session cookie can outlive its user row (database reset, removed
  // account). Send it back to the sign-in form instead of failing.
  let userOk = false;
  let userCheckFailed = false;
  try {
    userOk = await partnerUserExists(session.user.id);
  } catch (error) {
    console.error("[partner] user check failed", error instanceof Error ? error.name : typeof error);
    userCheckFailed = true;
  }
  // `redirect()` throws; keep it out of the try/catch above so it is not swallowed.
  if (userCheckFailed) {
    redirect("/login?error=Unavailable");
  }
  if (!userOk) {
    redirect("/login?error=SessionExpired");
  }
  const ref = (await cookies()).get(REFERRAL_COOKIE)?.value;
  try {
    await linkPartnerWalletFromVaultIfAbsent(session.user.id);
  } catch (error) {
    console.error(
      "[partner] linkPartnerWalletFromVaultIfAbsent failed",
      error instanceof Error ? error.name : typeof error,
    );
  }
  try {
    await attachReferralIfEligible(session.user.id, ref);
  } catch (error) {
    console.error(
      "[partner] attachReferral failed",
      error instanceof Error ? error.name : typeof error,
    );
  }
  let cabinet: Awaited<ReturnType<typeof loadCabinet>> | null = null;
  try {
    cabinet = await loadCabinet(session.user.id);
  } catch (error) {
    console.error("[partner] loadCabinet failed", error instanceof Error ? error.name : typeof error);
  }
  if (!cabinet) {
    redirect("/login?error=Unavailable");
  }
  const origin = process.env.AUTH_URL?.trim() || SITE_URL;
  const referralLink = `${origin.replace(/\/$/, "")}${partnerSharePath(cabinet.referralCode)}`;

  let protocolStatus: "connected" | "disconnected" = "disconnected";
  let protocolNote: string | null = "Node URL is not configured.";
  let pplBalance: number | null = null;
  let claims: { key: string; amount: number; status: string; level?: number; epoch?: number }[] = [];
  let claimsNote: string | null = null;

  if (cabinet.walletAddress) {
    const { connection, account } = await fetchAccountView(cabinet.walletAddress);
    if (connection.status === "connected") {
      protocolStatus = "connected";
      protocolNote = null;
      pplBalance = account?.pplBalance ?? null;
      const growth = await fetchGrowthClaims(cabinet.walletAddress);
      claims = growth.claims;
      claimsNote = growth.available ? null : (growth.note ?? null);
    } else {
      protocolNote =
        connection.reason === "not_configured"
          ? "Node URL is not configured."
          : "The configured node could not be reached.";
    }
  } else {
    const { connection } = await fetchAccountView("0x0000000000000000000000000000000000000000");
    if (connection.status === "connected") {
      protocolStatus = "connected";
      protocolNote = null;
    } else if (connection.reason === "not_configured") {
      protocolNote = "Node URL is not configured.";
    } else {
      protocolNote = "The configured node could not be reached.";
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <PartnerCabinet
          email={cabinet.email}
          referralCode={cabinet.referralCode}
          referralLink={referralLink}
          referredBy={cabinet.referredBy}
          walletAddress={cabinet.walletAddress}
          l1={cabinet.l1}
          l2={cabinet.l2}
          protocolStatus={protocolStatus}
          protocolNote={protocolNote}
          pplBalance={pplBalance}
          claims={claims}
          claimsNote={claimsNote}
        />
      </main>
      <Footer />
    </div>
  );
}
