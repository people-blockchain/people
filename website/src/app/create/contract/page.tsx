import { Suspense } from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ContractWizard } from "@/components/contract/ContractWizard";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Create a contract | PEOPLE Blockchain",
  description: "Describe a contract in plain words. A reviewed OpenZeppelin-based template is compiled and deployed with PPL gas from your wallet.",
  alternates: { canonical: "/create/contract" },
  openGraph: {
    title: "Create a smart contract",
    description: "Natural-language constructor for reviewed Solidity templates on PEOPLE Blockchain.",
    type: "website",
    siteName: SITE_NAME,
    url: "/create/contract"
  }
};

export default function CreateContractPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <Suspense fallback={null}>
          <ContractWizard />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
