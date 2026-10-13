import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { LavkaMerchantApp } from "@/components/lavka/LavkaMerchantApp";
import { isAuthConfigured } from "@/lib/partner/guards";
import { linkPartnerWalletFromVaultIfAbsent } from "@/lib/partner/service";

export const metadata: Metadata = {
  title: "Local shop | People",
  description: "Merchant loyalty passes and checkout QR on People's Blockchain testnet.",
  alternates: { canonical: "/lavka" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LavkaPage() {
  if (!isAuthConfigured()) {
    redirect("/login?callbackUrl=/lavka");
  }
  const session = await auth();
  if (session?.user?.id) {
    try {
      await linkPartnerWalletFromVaultIfAbsent(session.user.id);
    } catch {
      /* wallet link best-effort */
    }
  }
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <LavkaMerchantApp />
      </main>
      <Footer />
    </div>
  );
}
