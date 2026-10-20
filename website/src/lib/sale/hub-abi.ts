import { parseAbi } from "viem";

/** Minimal ABI for PplCurveHub purchases on Base (USDC `buyWith` path). */
export const PPL_CURVE_HUB_ABI = parseAbi([
  "function buyWith(address stable, address beneficiary, uint256 usdAmount, uint256 minPplOut) external",
]);

export const ERC20_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);
