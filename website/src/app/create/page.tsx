import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { FactoryHub } from "@/components/factory/FactoryHub";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "No-code builder | People's Blockchain",
  description: "No-code builder: token, NFT, escrow, crowdfunding, contracts and Lavka on People's Blockchain.",
  alternates: { canonical: "/create" },
  openGraph: {
    title: "No-code builder",
    description: "No-code builder for tokens, NFTs, escrow, crowdfunding and contracts.",
    type: "website",
    siteName: SITE_NAME,
    url: "/create",
  },
};

export default function CreatePage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <FactoryHub />
      </main>
      <Footer />
    </div>
  );
}
