/**
 * ERC-20 approval step of a Token → PPL swap. The swap is only simulated and sent after the approve
 * transaction has a successful receipt and the router's allowance is re-read from chain: wallets such
 * as MetaMask return the approve hash immediately, so a swap sent right away either fails its
 * preflight or is mined before the allowance exists.
 */
import { getAddress, type Address, type Hex } from "viem";
import { confirmTransfer, WalletSendError, type TransferPublicClient } from "@/lib/evm/wallet-send";

const allowanceAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type SwapApproveErrorCode = "approve_reverted" | "approve_timeout" | "approve_replaced" | "allowance_low";

export class SwapApproveError extends Error {
  readonly code: SwapApproveErrorCode;
  readonly hash?: Hex;

  constructor(code: SwapApproveErrorCode, hash?: Hex) {
    super(code);
    this.name = "SwapApproveError";
    this.code = code;
    this.hash = hash;
  }
}

export type EnsureAllowanceInput = {
  client: TransferPublicClient;
  token: Address;
  owner: Address;
  spender: Address;
  amount: bigint;
  /** Sends the approve transaction (through the shared preflight) and returns its hash. */
  sendApprove: () => Promise<Hex>;
  onApproving?: () => void;
};

async function readAllowance(input: EnsureAllowanceInput): Promise<bigint> {
  return (await input.client.readContract({
    address: getAddress(input.token),
    abi: allowanceAbi,
    functionName: "allowance",
    args: [getAddress(input.owner), getAddress(input.spender)],
  } as never)) as bigint;
}

/** Resolves once `spender` may pull `amount` of `token`; throws `SwapApproveError` otherwise. */
export async function ensureAllowance(input: EnsureAllowanceInput): Promise<{ approved: boolean }> {
  if ((await readAllowance(input)) >= input.amount) return { approved: false };
  input.onApproving?.();
  const hash = await input.sendApprove();
  try {
    await confirmTransfer(input.client, hash);
  } catch (err) {
    if (err instanceof WalletSendError) {
      const code = err.code === "tx_reverted" ? "approve_reverted" : err.code === "tx_replaced" ? "approve_replaced" : "approve_timeout";
      throw new SwapApproveError(code, hash);
    }
    throw err;
  }
  if ((await readAllowance(input)) < input.amount) throw new SwapApproveError("allowance_low", hash);
  return { approved: true };
}
