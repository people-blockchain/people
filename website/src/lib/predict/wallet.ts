import { isAddress, type Address } from "viem";
import { CHAIN_ID } from "./model";
export type PredictProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (event: string, listener: (...args: unknown[]) => void) => void; removeListener?: (event: string, listener: (...args: unknown[]) => void) => void };
export async function verifiedAccount(provider: PredictProvider, requestAccess = false): Promise<Address> {
  const chain = await provider.request({ method: "eth_chainId" });
  if (typeof chain !== "string" || !/^0x[0-9a-f]+$/i.test(chain) || BigInt(chain) !== BigInt(CHAIN_ID)) throw new Error("wrong_chain");
  const accounts = await provider.request({ method: requestAccess ? "eth_requestAccounts" : "eth_accounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || !isAddress(accounts[0])) throw new Error("no_account");
  return accounts[0];
}
