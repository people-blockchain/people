import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { SiteChrome } from "@/components/SiteChrome";
import { NftTokenView } from "@/components/nft/NftTokenView";
import { readNftTokenOnChain } from "@/lib/evm/nft-chain";
import { fetchNftTokenMetadata } from "@/lib/nft-token-metadata";

export default async function NftTokenPage({
  params,
}: {
  params: Promise<{ collection: string; id: string }>;
}) {
  const { collection, id } = await params;
  if (!isAddress(collection) || !/^\d+$/.test(id)) notFound();
  const token = await readNftTokenOnChain(collection, BigInt(id));
  if (!token) notFound();
  const metadata = token.tokenUri ? await fetchNftTokenMetadata(token.tokenUri) : null;
  return (
    <SiteChrome>
      <NftTokenView
        name={token.name}
        collection={token.collection}
        tokenId={token.onChainTokenId}
        owner={token.owner}
        tokenUri={token.tokenUri ?? ""}
        metadata={metadata}
      />
    </SiteChrome>
  );
}
