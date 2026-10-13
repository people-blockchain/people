import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  matchRedeemVisitEvent,
  verifyEscrowCreatedTx,
  verifyRedeemVisitTx,
  verifyProgramCreatedTx,
} from "../src/lib/lavka/chain-verify.ts";
import {
  MAX_MERCHANT_DISPLAY_NAME,
  MAX_PROGRAM_TITLE,
  displayNameError,
  programTitleError,
} from "../src/lib/lavka/limits.ts";

test("redeem verification rejects a malformed tx hash before touching the network", async () => {
  const result = await verifyRedeemVisitTx("not-a-hash", 1, "0x1111111111111111111111111111111111111111");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "invalid_tx_hash");
});

test("program-created verification rejects a malformed tx hash before touching the network", async () => {
  const result = await verifyProgramCreatedTx("not-a-hash", "0x1111111111111111111111111111111111111111");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "invalid_tx_hash");
});

test("escrow verification rejects a malformed tx hash before touching the network (M08-7)", async () => {
  const result = await verifyEscrowCreatedTx(
    "not-a-hash",
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "invalid_tx_hash");
});

test("escrow records are built from chain state, not from the request body (M08-7)", async () => {
  const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");
  const route = await read("../src/app/api/lavka/escrow/route.ts");
  const service = await read("../src/lib/lavka/service.ts");

  // The route may not accept an id/amount/deadline the client made up.
  for (const field of ["body.chainEscrowId", "body.amountPpl", "body.deadline"]) {
    assert.ok(!route.includes(field), `route must not read ${field}`);
  }
  assert.ok(
    route.includes("recordEscrowFromChain"),
    "the route must go through the chain-verified service call",
  );

  // The service verifies before it writes, and stores what the chain said.
  const verifyAt = service.indexOf("verifyEscrowCreatedTx");
  assert.ok(verifyAt > -1, "the service must verify the create tx");
  const insertAt = service.indexOf("insert(lavkaEscrowRecords)");
  assert.ok(insertAt > verifyAt, "verification must run before the insert");
  for (const field of ["verify.chainEscrowId", "verify.amountPpl", "verify.deadline"]) {
    assert.ok(service.includes(field), `the stored ${field} must come from the verified event`);
  }
});

const HOLDER = "0x1111111111111111111111111111111111111111";

test("AUD-M14: a zero-visit VisitRedeemed event is rejected", () => {
  const result = matchRedeemVisitEvent(
    { programId: 7n, holder: HOLDER, visits: 0n },
    7,
    HOLDER,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "zero_visits");
});

test("AUD-M14: the on-chain visit count must match the requested count", () => {
  const args = { programId: 7n, holder: HOLDER, visits: 5n };
  const ok = matchRedeemVisitEvent(args, 7, HOLDER, 5);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.visits, 5);

  const mismatch = matchRedeemVisitEvent(args, 7, HOLDER, 1);
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.error, "visits_mismatch");

  // No requested count: the chain value is recorded as-is (still >= 1).
  const unchecked = matchRedeemVisitEvent(args, 7, HOLDER);
  assert.equal(unchecked.ok, true);
  if (unchecked.ok) assert.equal(unchecked.visits, 5);
});

test("AUD-M14: program and holder mismatches are still reported", () => {
  const args = { programId: 7n, holder: HOLDER, visits: 1n };
  const wrongProgram = matchRedeemVisitEvent(args, 8, HOLDER);
  assert.equal(wrongProgram.ok, false);
  if (!wrongProgram.ok) assert.equal(wrongProgram.error, "program_mismatch");
  const wrongHolder = matchRedeemVisitEvent(args, 7, "0x2222222222222222222222222222222222222222");
  assert.equal(wrongHolder.ok, false);
  if (!wrongHolder.ok) assert.equal(wrongHolder.error, "holder_mismatch");
});

test("AUD-M14: the redeem route forwards the requested count to the verifier", async () => {
  const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");
  const route = await read("../src/app/api/lavka/redeem/route.ts");
  const service = await read("../src/lib/lavka/service.ts");
  const client = await read("../src/components/lavka/LavkaVenueClient.tsx");

  assert.ok(route.includes("expectedVisits"), "the route must pass the count through");
  assert.ok(service.includes("input.expectedVisits"), "the service must forward the count");
  assert.ok(client.includes("visits: 1"), "the venue client must state the count it redeemed");
});

test("LAV-M6: merchant display names are capped at 80 characters", () => {
  const atCap = "n".repeat(MAX_MERCHANT_DISPLAY_NAME);
  assert.equal(MAX_MERCHANT_DISPLAY_NAME, 80);
  assert.equal(displayNameError(atCap), null);
  assert.equal(displayNameError(`${atCap}x`), "invalid_name");
  assert.equal(displayNameError("n".repeat(MAX_MERCHANT_DISPLAY_NAME + 1)), "invalid_name");
  assert.equal(displayNameError("a"), "invalid_name");
  assert.equal(displayNameError("  ab  "), null);
});

test("LAV-M6: program titles are capped at 120 characters", () => {
  const atCap = "t".repeat(MAX_PROGRAM_TITLE);
  assert.equal(MAX_PROGRAM_TITLE, 120);
  assert.equal(programTitleError(atCap), null);
  assert.equal(programTitleError(`${atCap}x`), "invalid_title");
  assert.equal(programTitleError("t".repeat(MAX_PROGRAM_TITLE + 1)), "invalid_title");
  assert.equal(programTitleError("a"), "invalid_title");
});

test("LAV-M6: routes and service enforce the caps", async () => {
  const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");
  const merchantRoute = await read("../src/app/api/lavka/merchant/route.ts");
  const programsRoute = await read("../src/app/api/lavka/programs/route.ts");
  const service = await read("../src/lib/lavka/service.ts");

  assert.ok(merchantRoute.includes("displayNameError"), "merchant route must use the shared cap");
  assert.ok(programsRoute.includes("programTitleError"), "programs route must use the shared cap");
  assert.ok(service.includes("displayNameError(input.displayName)"), "upsertMerchant must re-check");
  assert.ok(service.includes("programTitleError(input.title)"), "registerProgram must re-check");
});
