import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { LavkaVenueClient } from "@/components/lavka/LavkaVenueClient";

type Props = { params: Promise<{ slug: string }> };

export default async function LavkaPayPage({ params }: Props) {
  const { slug } = await params;
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <LavkaVenueClient slug={slug} mode="pay" />
      </main>
      <Footer />
    </div>
  );
}
