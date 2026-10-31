/**
 * Contract-call flavour of `preflightAndSend` (see `tx-preflight.ts`): encodes the call, simulates
 * and estimates it, and only then lets the caller's wallet send it with `gas = estimate * 1.2`.
 * Every contract write in the app goes through here so none of them can send a doomed transaction.
 */
import { encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { preflightAndSend, type PreflightClient } from "@/lib/evm/tx-preflight";

export type PreflightWriteRequest = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

export async function preflightWriteContract(
  client: PreflightClient,
  account: Address,
  request: PreflightWriteRequest,
  write: (gas: bigint) => Promise<Hex>,
): Promise<Hex> {
  const abi = request.abi as Abi;
  return preflightAndSend(
    client,
    ({ gas }) => write(gas),
    {
      account,
      to: request.address,
      data: encodeFunctionData({ abi, functionName: request.functionName, args: request.args } as never),
      value: request.value,
    },
    { abi },
  );
}
