import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { FactoryWizard } from "@/components/factory/FactoryWizard";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Create an NFT | PEOPLE Blockchain",
  description: "No-code NFT mint: image, SVG or video, name, description, pay in PPL.",
  alternates: { canonical: "/create/nft" },
  openGraph: {
    title: "Create an NFT",
    description: "Mint a unique NFT with an image, SVG or video and metadata.",
    type: "website",
    siteName: SITE_NAME,
    url: "/create/nft",
  },
};

export default function CreateNftPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <FactoryWizard kind="nft" />
      </main>
      <Footer />
    </div>
  );
}
