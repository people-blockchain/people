import { notFound } from "next/navigation";
import { SiteChrome } from "@/components/SiteChrome";
import { NftView } from "@/components/explorer/NftView";
import { parseNftParams } from "@/lib/nft-explorer";

export default async function NftPage({ params }: { params: Promise<{ collection: string; id: string }> }) {
  const { collection, id } = await params;
  const parsed = parseNftParams(collection, id);
  if (!parsed) notFound();
  return <SiteChrome><NftView key={`${parsed.collection}:${parsed.tokenId}`} collection={parsed.collection} tokenId={parsed.tokenId} /></SiteChrome>;
}
