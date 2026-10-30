import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeErrorResult } from "viem";

import { decodeRevertReason } from "../src/lib/evm/tx-preflight.ts";
import {
  CREATE_FLOW_ERRORS_ABI,
  preflightErrorDetails,
  preflightErrorMessage,
  txPreflightCopy,
} from "../src/lib/evm/tx-preflight-copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const langs = ["ar", "de", "en", "es", "fr", "id", "it", "pt", "ru", "tr", "vi", "zh"];
const keys = [
  "errorInsufficientFloat",
  "errorStableNotAccepted",
  "errorFeeOutOfBounds",
  "errorPplTransferFailed",
  "errorEnforcedPause",
  "errorUnauthorized",
  "errorErc20Allowance",
  "errorErc20Balance",
  "errorSafeTransfer",
  "preflightDetails",
];

function nested(data) {
  const raw = Object.assign(new Error("execution reverted"), { name: "RawContractError", data });
  const mid = new Error("The contract function reverted.", { cause: raw });
  return new Error("Call failed.", { cause: mid });
}

test("InsufficientFloat is a friendly sentence, with the raw revert behind details", () => {
  const data = encodeErrorResult({
    abi: CREATE_FLOW_ERRORS_ABI,
    errorName: "InsufficientFloat",
    args: [10n, 3n],
  });
  const reason = decodeRevertReason(nested(data), CREATE_FLOW_ERRORS_ABI);
  assert.equal(reason.errorName, "InsufficientFloat");
  const message = preflightErrorMessage(reason, txPreflightCopy.en, { payingWithStable: true });
  assert.equal(message, txPreflightCopy.en.errorInsufficientFloat);
  assert.doesNotMatch(message, /InsufficientFloat\(/);
  assert.match(preflightErrorDetails(reason), /InsufficientFloat\(/);
  const src = readFileSync(join(root, "src/components/factory/EvmTokenLaunch.tsx"), "utf8");
  assert.match(src, /preflightErrorDetails/);
  assert.match(src, /<details/);
  assert.match(src, /preflightDetails/);
});

test("every locale has the known-revert sentences", () => {
  const base = JSON.parse(readFileSync(join(root, "src/lib/locales/surfaces/tx-preflight-en.json"), "utf8"));
  for (const lang of langs) {
    const copy = JSON.parse(readFileSync(join(root, `src/lib/locales/surfaces/tx-preflight-${lang}.json`), "utf8"));
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(base).sort(), lang);
    for (const key of keys) {
      assert.equal(typeof copy[key], "string", `${lang}.${key}`);
      assert.ok(copy[key].length > 10, `${lang}.${key}`);
      assert.equal(txPreflightCopy[lang][key], copy[key], `${lang}.${key}`);
    }
    const data = encodeErrorResult({
      abi: CREATE_FLOW_ERRORS_ABI,
      errorName: "InsufficientFloat",
      args: [10n, 3n],
    });
    const reason = decodeRevertReason(nested(data), CREATE_FLOW_ERRORS_ABI);
    const message = preflightErrorMessage(reason, txPreflightCopy[lang], { payingWithStable: false });
    assert.equal(message, copy.errorInsufficientFloat);
    assert.doesNotMatch(message, /InsufficientFloat\(/);
  }
});
