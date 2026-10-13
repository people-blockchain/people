import { SiteChrome } from "@/components/SiteChrome";
import { TokenView } from "@/components/explorer/TokenView";

export default async function TokenPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  return <SiteChrome><TokenView key={assetId} assetId={assetId} /></SiteChrome>;
}
