"use client";

import { useCallback, useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  BountyBounties,
  BountyCommunity,
  BountyCountdown,
  BountyEarn,
  BountyFinal,
  BountyHero,
  BountyReferral,
  BountyTasks,
  BountyTokenomics,
} from "@/components/bounty/BountyHub";
import { FoundersNftCard } from "@/components/founders/FoundersNftCard";
import { useWallet } from "@/context/WalletContext";

export default function BountyPage() {
  const { session } = useWallet();
  const walletUserId = session?.userId ?? null;
  const [signedIn, setSignedIn] = useState(false);

  // Same signal FoundersApp passes into the card: `/api/founders/me`, re-read after a
  // Web3Auth sign-in on this page sets the wallet session in place.
  const loadSignedIn = useCallback(async () => {
    try {
      const res = await fetch("/api/founders/me", { cache: "no-store", credentials: "include" });
      if (!res.ok) return;
      const body = (await res.json()) as { signedIn?: boolean };
      setSignedIn(body.signedIn === true);
    } catch {
      /* the card stays hidden until a later read succeeds */
    }
  }, []);

  useEffect(() => {
    void loadSignedIn();
  }, [loadSignedIn, walletUserId]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <BountyHero />
        <BountyCountdown />
        <FoundersNftCard signedIn={signedIn} />
        <BountyEarn />
        <BountyTasks />
        <BountyCommunity />
        <BountyReferral />
        <BountyBounties />
        <BountyTokenomics />
        <BountyFinal />
      </main>
      <Footer />
    </div>
  );
}
