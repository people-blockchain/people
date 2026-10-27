/**
 * Server-side "is the sale open?" gate.
 *
 * Fails closed: a missing contract, a failed RPC read or any other error means
 * the sale is closed.
 */

import type { Address } from "viem";

import { hubGateStatus, readHubSaleSnapshot } from "./hub-read";
import { getBaseSaleNetwork } from "./sale-hub";

export async function resolveHubOpen(): Promise<boolean> {
  try {
    const network = getBaseSaleNetwork();
    if (!network.enabled) return false;
    const snapshot = await readHubSaleSnapshot(network.evm.saleContract as Address);
    return snapshot !== null && hubGateStatus(snapshot) === "open";
  } catch {
    return false;
  }
}
