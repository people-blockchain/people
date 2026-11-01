"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { ensureCloudWalletSession, fetchAuthSessionUser, WalletCloudError } from "@/lib/wallet-cloud-client";
import { warnCloudOpenFailed } from "@/lib/wallet-cloud-crypto";

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
          await connectCloud(cloud);
        }
        const res = await fetch("/api/partner/wallet/sync-vault", { method: "POST", credentials: "include" });
        if (res.ok) router.refresh();
        else warnCloudOpenFailed({ code: "partner_sync_failed", stage: "partner_sync", vaultPresent: true, retried: false });
      } catch (err) {
        const code = err instanceof WalletCloudError ? err.code : "unknown";
        if (!(err instanceof WalletCloudError) || !err.logged) {
          warnCloudOpenFailed({ code, stage: "partner_refresh", vaultPresent: false, retried: false });
        }
      }
    })();
  }, [walletAddress, session, connectCloud, router]);

  return null;
}
