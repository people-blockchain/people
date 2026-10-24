/**
 * Copy for the NFT media flow on `/create/nft` (type picker, previews, stages, errors).
 *
 * EN is the base; every locale has a full `nft-media-<lang>.json` and is deep-merged over EN so a
 * missing key can never render `undefined`. Same pattern as `buy-content.ts`.
 */

import type { Language } from "./preferences";
import en from "./locales/surfaces/nft-media-en.json" with { type: "json" };
import ru from "./locales/surfaces/nft-media-ru.json" with { type: "json" };
import es from "./locales/surfaces/nft-media-es.json" with { type: "json" };
import pt from "./locales/surfaces/nft-media-pt.json" with { type: "json" };
import fr from "./locales/surfaces/nft-media-fr.json" with { type: "json" };
import de from "./locales/surfaces/nft-media-de.json" with { type: "json" };
import it from "./locales/surfaces/nft-media-it.json" with { type: "json" };
import tr from "./locales/surfaces/nft-media-tr.json" with { type: "json" };
import vi from "./locales/surfaces/nft-media-vi.json" with { type: "json" };
import id from "./locales/surfaces/nft-media-id.json" with { type: "json" };
import zh from "./locales/surfaces/nft-media-zh.json" with { type: "json" };
import ar from "./locales/surfaces/nft-media-ar.json" with { type: "json" };

export type NftMediaCopy = typeof en;

const rawByLanguage: Record<Language, Partial<NftMediaCopy>> = { en, ru, es, pt, fr, de, it, tr, vi, id, zh, ar };

export const nftMediaCopy: Record<Language, NftMediaCopy> = Object.fromEntries(
  Object.entries(rawByLanguage).map(([lang, copy]) => [lang, { ...en, ...copy }]),
) as Record<Language, NftMediaCopy>;
