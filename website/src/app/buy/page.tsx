import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { SaleNotOpenNotice } from "@/components/sale/SaleNotOpenNotice";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "PPL sale",
  description:
    "The public PPL sale is not open. No prices are published, there is no payment widget and no KYC flow runs on this site.",
};

export default function BuyPplPage() {
  return (
    <SiteChrome>
      <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Eyebrow tone="value">PPL</Eyebrow>
        </div>
        <SaleNotOpenNotice />
      </article>
    </SiteChrome>
  );
}
