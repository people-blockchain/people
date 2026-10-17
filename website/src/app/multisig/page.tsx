import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { MultisigPanel } from "@/components/multisig/MultisigPanel";

export const metadata: Metadata = {
  title: "Testnet multisig | PEOPLE Blockchain",
  description: "People's own 2-of-3 multisig on the People testnet: owners, threshold and transactions.",
  alternates: { canonical: "/multisig" },
  robots: { index: false },
};

export default function MultisigPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <MultisigPanel />
      </main>
      <Footer />
    </div>
  );
}
