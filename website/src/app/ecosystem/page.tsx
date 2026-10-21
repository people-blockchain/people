import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { EcosystemDirectory } from "@/components/ecosystem/EcosystemDirectory";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Ecosystem | PEOPLE Blockchain",
  description: "Products and tools built on and for PEOPLE Blockchain.",
  alternates: { canonical: "/ecosystem" },
  openGraph: {
    title: "Ecosystem",
    description: "Products and tools built on and for PEOPLE Blockchain.",
    type: "website",
    siteName: SITE_NAME,
    url: "/ecosystem",
  },
};

export default function EcosystemPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <EcosystemDirectory />
      </main>
      <Footer />
    </div>
  );
}
