/**
 * Owner-approved public PPL fees (PR #27).
 *
 * Historical conversion notes (not shown on the public site):
 * - `FEE_QUOTE_PPL_PRICE_USD` matches node `PPL_PRICE_USD` default (0.12).
 *   There is no live PPL/USD rate in this repository.
 * - `FEE_QUOTE_SOL_USD` is a dated spot assumption (2026-09-29, round 117 USD/SOL).
 *
 * Public UI must display PPL only.
 */

/** Node demo reference (`PPL_PRICE_USD` / `VLS_PRICE_USD` fallback). Not a listed market. */
export const FEE_QUOTE_PPL_PRICE_USD = 0.12;

/**
 * Dated SOL/USD assumption for converting Solana lamports/rent into PPL.
 * Sources around 2026-09-29: ~$116.61 (TradingKey) to ~$118.17 (Brave New Coin).
 */
export const FEE_QUOTE_SOL_USD = 117;

export const SOLANA_LAMPORTS_PER_SOL = 1_000_000_000;
/** https://solana.com/docs/core/fees — base fee 5,000 lamports per signature. */
export const SOLANA_BASE_FEE_LAMPORTS = 5_000;
export const SOLANA_BASE_FEE_SOL = SOLANA_BASE_FEE_LAMPORTS / SOLANA_LAMPORTS_PER_SOL;

/**
 * Classic SPL mint (82 data bytes) rent-exempt minimum observed on mainnet
 * at 5,080 lamports/byte: (128 + 82) * 5080 = 1,066,800 lamports = 0.0010668 SOL.
 * https://sol-incinerator.com/blog/solana-rent-by-account-type (check dated 2026-09-24).
 */
export const SOLANA_SPL_MINT_RENT_SOL = 0.0010668;

/**
 * Metaplex Core base asset: ~0.003 SOL (rent ~0.0015 + protocol 0.0015 + tx fee).
 * https://www.metaplex.com/docs/smart-contracts/core/create-asset
 */
export const SOLANA_METAPLEX_CORE_NFT_SOL = 0.003;

/** Token Metadata NFT mint cost cited by Metaplex (~0.022 SOL). Reference only. */
export const SOLANA_TOKEN_METADATA_NFT_SOL = 0.022;

export function solToPpl(sol: number): number {
  return Math.round((sol * FEE_QUOTE_SOL_USD) / FEE_QUOTE_PPL_PRICE_USD * 1e6) / 1e6;
}

/** SPL mint rent + one signature, converted to PPL. */
export const DEFAULT_TOKEN_CREATE_MIN_FEE = solToPpl(SOLANA_SPL_MINT_RENT_SOL + SOLANA_BASE_FEE_SOL);

/** Metaplex Core ~0.003 SOL, converted to PPL. */
export const DEFAULT_NFT_MINT_MIN_FEE = solToPpl(SOLANA_METAPLEX_CORE_NFT_SOL);

/** Ordinary transfer default: one Solana signature at the conversion above. */
export const DEFAULT_TRANSFER_FEE_PPL = solToPpl(SOLANA_BASE_FEE_SOL);

/** @deprecated Use `DEFAULT_TRANSFER_FEE_PPL`. */
export const PROPOSED_TRANSFER_FEE_PPL = DEFAULT_TRANSFER_FEE_PPL;

/** Pre-tariff transfer default (reference for batch fee scaling). */
const LEGACY_DEFAULT_TRANSFER_FEE_PPL = 0.1;

const TRANSFER_FEE_TARIFF_SCALE = DEFAULT_TRANSFER_FEE_PPL / LEGACY_DEFAULT_TRANSFER_FEE_PPL;

function scaleLegacyTransferTariff(legacyPpl: number): number {
  return Math.round(legacyPpl * TRANSFER_FEE_TARIFF_SCALE * 1e6) / 1e6;
}

/** Batch transfer base fee (scaled from legacy 0.1 PPL with transfer tariff). */
export const BATCH_FEE_BASE_PPL = scaleLegacyTransferTariff(LEGACY_DEFAULT_TRANSFER_FEE_PPL);

/** Per extra batch recipient (scaled from legacy 0.005 PPL). */
export const BATCH_FEE_PER_EXTRA_PPL = scaleLegacyTransferTariff(0.005);

/** Batch transfer fee cap (scaled from legacy 0.5 PPL). */
export const BATCH_FEE_CAP_PPL = scaleLegacyTransferTariff(0.5);
