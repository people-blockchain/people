import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { FactoryHub } from "@/components/factory/FactoryHub";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Create | People's Blockchain",
  description: "Create a token or NFT without writing code. Pay in PPL when a network is connected.",
  alternates: { canonical: "/create" },
  openGraph: {
    title: "Create a token or NFT",
    description: "No-code Token Factory and NFT mint on People's Blockchain.",
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
