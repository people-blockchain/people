import { SiteChrome } from "@/components/SiteChrome";
import { BlockView } from "@/components/explorer/ExplorerViews";

export default async function BlockPage({ params }: { params: Promise<{ height: string }> }) {
  const { height } = await params;
  return (
    <SiteChrome>
      <BlockView height={height} />
    </SiteChrome>
  );
}
