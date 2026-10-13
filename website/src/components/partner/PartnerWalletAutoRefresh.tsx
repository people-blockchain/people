"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { ensureCloudWalletSession, fetchAuthSessionUser } from "@/lib/wallet-cloud-client";

/** After account login, create cloud vault + partner link without a manual bind step. */
export function PartnerWalletAutoRefresh({ walletAddress }: { walletAddress: string | null }) {
  const router = useRouter();
  const { connectCloud, session } = useWallet();
  const tried = useRef(false);

  useEffect(() => {
    if (walletAddress || tried.current) return;
    tried.current = true;
    void (async () => {
      const user = await fetchAuthSessionUser();
      if (!user) return;
      try {
        if (!session) {
          const cloud = await ensureCloudWalletSession(user);
          connectCloud(cloud);
        }
        const res = await fetch("/api/partner/wallet/sync-vault", { method: "POST", credentials: "include" });
        if (res.ok) router.refresh();
      } catch {
        /* user may complete sign-in from /login */
      }
    })();
  }, [walletAddress, session, connectCloud, router]);

  return null;
}
