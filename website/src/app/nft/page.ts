import { redirect } from "next/navigation";
import { nftIndexPath } from "@/lib/evm/nft-chain";

/** `/nft` has no collection or token. The explorer list is the index. */
export default function NftIndexPage(): never {
  redirect(nftIndexPath());
}
