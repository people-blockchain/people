import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteChrome } from "@/components/SiteChrome";
import { WalletApp } from "@/components/wallet/WalletApp";
import { SITE_NAME } from "@/lib/site";
import { resolveNodeWebSocketUrl, resolvePublicChainId } from "@/lib/node-rpc";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "People Wallet | PEOPLE Blockchain",
  description: "People Wallet — PPL in your browser: a non-custodial 12-word browser wallet (keys stay on your device) or Google sign-in for a cloud wallet (key stored encrypted on PEOPLE servers; PEOPLE can decrypt it).",
  alternates: { canonical: "/wallet" },
  manifest: "/people-wallet.webmanifest",
  openGraph: {
    title: "People Wallet",
    description: "Create or import People Wallet. Pay Token Factory fees in PPL.",
    type: "website",
    siteName: SITE_NAME,
    url: "/wallet",
  },
};

export default function WalletPage() {
  return (
    <SiteChrome>
      <Suspense fallback={null}>
        <WalletApp wsUrl={resolveNodeWebSocketUrl()} chainId={resolvePublicChainId()} nftTransfersEnabled={process.env.NFT_TRANSFERS_ENABLED === "1"} />
      </Suspense>
    </SiteChrome>
  );
}
