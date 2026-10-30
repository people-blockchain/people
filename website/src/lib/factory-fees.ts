/**
 * Owner-approved public PPL fees. Public pages show PPL only.
 * Wei constants are the source of truth. The number aliases remain for callers
 * that still take a JS number; do not do new amount math with them.
 */

import { parseUnits } from "viem";

export const DEFAULT_TRANSFER_FEE_WEI = parseUnits("0.004875", 18);
export const DEFAULT_TOKEN_CREATE_FEE_WEI = parseUnits("1.045005", 18);
export const DEFAULT_NFT_MINT_FEE_WEI = parseUnits("2.925", 18);
export const APPROVED_CONTRACT_GAS_PRICE_WEI = parseUnits("0.00000087", 18);
export const TYPICAL_CONTRACT_DEPLOY_FEE_WEI = parseUnits("1.044", 18);

export const DEFAULT_TRANSFER_FEE_PPL = 0.004875;
export const DEFAULT_TOKEN_CREATE_FEE_PPL = 1.045005;
export const DEFAULT_NFT_MINT_FEE_PPL = 2.925;

/** EVM contract gas — owner-approved 2026-09-29 (see `@people/protocol`). */
export const APPROVED_CONTRACT_GAS_PRICE_PPL = 8.7e-7;
export const TYPICAL_CONTRACT_DEPLOY_GAS = 1_200_000;
export const TYPICAL_CONTRACT_DEPLOY_FEE_PPL = 1.044;
