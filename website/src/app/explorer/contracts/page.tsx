import { SiteChrome } from "@/components/SiteChrome";
import { ContractList } from "@/components/explorer/ContractList";
import { isCosmosEvmChain } from "@/lib/chain-mode";

export default function ContractsPage() {
  // The compat layer has no `contracts` index on the EVM chain (only `contracts/<address>`), so
  // the client list never fetches there and simply renders empty. Telling it so from the server
  // keeps the first paint from showing a skeleton that hydration then replaces with that same
  // empty state. The legacy chain's index is a live node proxy, not a cheap server-side read, so
  // it keeps fetching in the effect (it has its own error/empty handling).
  return (
    <SiteChrome>
      <ContractList initialLoaded={isCosmosEvmChain()} />
    </SiteChrome>
  );
}
