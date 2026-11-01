import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { SiteChrome } from "@/components/SiteChrome";
import { NftTokenView } from "@/components/nft/NftTokenView";
import { readNftTokenOnChain } from "@/lib/evm/nft-chain";

export default async function NftTokenPage({
  params,
}: {
  params: Promise<{ collection: string; id: string }>;
}) {
  const { collection, id } = await params;
  if (!isAddress(collection) || !/^\d+$/.test(id)) notFound();
  const token = await readNftTokenOnChain(collection, BigInt(id));
  if (!token) notFound();
  return (
    <SiteChrome>
      <NftTokenView
        name={token.name}
        collection={token.collection}
        tokenId={token.onChainTokenId}
        owner={token.owner}
        tokenUri={token.tokenUri ?? ""}
      />
    </SiteChrome>
  );
}
