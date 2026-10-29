/**
 * Copy for `/explorer/nft/<collection>/<id>` and the "View your NFT" link after minting.
 *
 * EN is the base; every locale has a full `nft-explorer-<lang>.json` and is merged over EN so a
 * missing key can never render `undefined`. Same pattern as `nft-media-copy.ts`.
 */

import type { Language } from "./preferences";
import en from "./locales/surfaces/nft-explorer-en.json" with { type: "json" };
import ru from "./locales/surfaces/nft-explorer-ru.json" with { type: "json" };
import es from "./locales/surfaces/nft-explorer-es.json" with { type: "json" };
import pt from "./locales/surfaces/nft-explorer-pt.json" with { type: "json" };
import fr from "./locales/surfaces/nft-explorer-fr.json" with { type: "json" };
import de from "./locales/surfaces/nft-explorer-de.json" with { type: "json" };
import it from "./locales/surfaces/nft-explorer-it.json" with { type: "json" };
import tr from "./locales/surfaces/nft-explorer-tr.json" with { type: "json" };
import vi from "./locales/surfaces/nft-explorer-vi.json" with { type: "json" };
import id from "./locales/surfaces/nft-explorer-id.json" with { type: "json" };
import zh from "./locales/surfaces/nft-explorer-zh.json" with { type: "json" };
import ar from "./locales/surfaces/nft-explorer-ar.json" with { type: "json" };

export type NftExplorerCopy = typeof en;

const rawByLanguage: Record<Language, Partial<NftExplorerCopy>> = { en, ru, es, pt, fr, de, it, tr, vi, id, zh, ar };

export const nftExplorerCopy: Record<Language, NftExplorerCopy> = Object.fromEntries(
  Object.entries(rawByLanguage).map(([lang, copy]) => [lang, { ...en, ...copy }]),
) as Record<Language, NftExplorerCopy>;
