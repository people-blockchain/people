import * as real from "../../src/lib/evm/log-scan-cursor.ts";

export const writeLogScanCursor = real.writeLogScanCursor;

/** Test hook: `EVM_TEST_FAIL_CURSOR_FACTORY=<address>` makes that factory's scan reject. */
export async function readLogScanCursor(address, topic) {
  const fail = (process.env.EVM_TEST_FAIL_CURSOR_FACTORY ?? "").toLowerCase();
  if (fail && address.toLowerCase() === fail) throw new Error("test_factory_failure");
  return real.readLogScanCursor(address, topic);
}
