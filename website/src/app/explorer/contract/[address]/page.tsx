import { SiteChrome } from "@/components/SiteChrome";
import { ContractExplorer } from "@/components/explorer/ContractExplorer";

export default async function ExplorerContractPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <SiteChrome>
      <ContractExplorer address={decodeURIComponent(address)} />
    </SiteChrome>
  );
}
