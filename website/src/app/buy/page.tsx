import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { PplSaleCheckout } from "@/components/sale/PplSaleCheckout";
import { Eyebrow, Chip } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Buy PPL",
  description:
    "Community sale checkout — BNB Chain, Base, Ethereum, Polygon, Tron, TON and Solana.",
};

export default function BuyPplPage() {
  return (
    <SiteChrome>
      <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Eyebrow tone="value">Buy</Eyebrow>
          <Chip tone="value">Testnet</Chip>
        </div>
        <PplSaleCheckout />
      </article>
    </SiteChrome>
  );
}
