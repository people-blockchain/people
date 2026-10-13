import { SiteChrome } from "@/components/SiteChrome";
import { AddressView } from "@/components/explorer/ExplorerViews";

export default async function AddressPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <SiteChrome>
      <AddressView address={decodeURIComponent(address)} />
    </SiteChrome>
  );
}
