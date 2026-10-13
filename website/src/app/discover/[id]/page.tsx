import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { DiscoverProjectView } from "@/components/discover/DiscoverProjectView";
import { discoverProjectTitleForMetadata, loadDiscoverProjectDetailForPage } from "@/lib/discover/feed-server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await loadDiscoverProjectDetailForPage(id);
  const title = discoverProjectTitleForMetadata(detail, id);
  return {
    title: `${title} | People`,
    alternates: { canonical: `/discover/${id}` },
  };
}

export default async function DiscoverProjectPage({ params }: Props) {
  const { id } = await params;
  const initialDetail = await loadDiscoverProjectDetailForPage(id);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <DiscoverProjectView id={id} initialDetail={initialDetail} />
      </main>
      <Footer />
    </div>
  );
}
