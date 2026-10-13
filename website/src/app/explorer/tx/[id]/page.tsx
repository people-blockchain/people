import { SiteChrome } from "@/components/SiteChrome";
import { TxView } from "@/components/explorer/ExplorerViews";

export default async function TxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <SiteChrome>
      <TxView id={decodeURIComponent(id)} />
    </SiteChrome>
  );
}
