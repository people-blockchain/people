import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, custom, encodeErrorResult, toFunctionSelector } from "viem";
import {
  GAS_BUFFER_DEN,
  GAS_BUFFER_NUM,
  TxPreflightError,
  decodeRevertReason,
  isDailyLimitRevert,
  preflightAndSend,
  preflightTx,
  withGasBuffer,
} from "../src/lib/evm/tx-preflight.ts";
import { CREATE_FLOW_ERRORS_ABI, preflightErrorMessage, txPreflightCopy } from "../src/lib/evm/tx-preflight-copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const account = "0x1111111111111111111111111111111111111111";
const factory = "0x2222222222222222222222222222222222222222";
const stable = "0x3333333333333333333333333333333333333333";
const tx = { account, to: factory, data: "0xdeadbeef", value: 5n };

const errorStringData = encodeErrorResult({
  abi: [{ type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] }],
  errorName: "Error",
  args: ["token name taken"],
});
const panicData = encodeErrorResult({
  abi: [{ type: "error", name: "Panic", inputs: [{ name: "code", type: "uint256" }] }],
  errorName: "Panic",
  args: [0x11n],
});
const dailyCapData = encodeErrorResult({ abi: CREATE_FLOW_ERRORS_ABI, errorName: "DailyCapExceeded", args: [account] });
const floatData = encodeErrorResult({ abi: CREATE_FLOW_ERRORS_ABI, errorName: "InsufficientFloat", args: [10n, 3n] });

/** viem nests the revert bytes a few `cause` levels deep. */
function nested(data) {
  const raw = Object.assign(new Error("execution reverted"), { name: "RawContractError", data });
  const mid = new Error("The contract function reverted.", { cause: raw });
  return new Error("Call failed.", { cause: mid });
}

function mockClient({ call, estimate }) {
  const calls = { call: 0, estimateGas: 0 };
  return {
    calls,
    client: {
      call: async (...args) => {
        calls.call += 1;
        if (call instanceof Error) throw call;
        return call?.(...args) ?? { data: "0x" };
      },
      estimateGas: async (...args) => {
        calls.estimateGas += 1;
        if (estimate instanceof Error) throw estimate;
        return typeof estimate === "function" ? estimate(...args) : estimate;
      },
    },
  };
}

test("gas buffer constants and rounding up", () => {
  assert.equal(GAS_BUFFER_NUM, 12n);
  assert.equal(GAS_BUFFER_DEN, 10n);
  assert.equal(withGasBuffer(100000n), 120000n);
  assert.equal(withGasBuffer(101n), 122n); // 121.2 rounds up
  assert.equal(withGasBuffer(0n), 0n);
  assert.equal(typeof withGasBuffer(7n), "bigint");
});

test("decodeRevertReason decodes Error(string) from a nested cause", () => {
  const reason = decodeRevertReason(nested(errorStringData));
  assert.equal(reason.kind, "error");
  assert.equal(reason.message, "token name taken");
  assert.equal(reason.data, errorStringData);
});

test("decodeRevertReason decodes Panic(uint256)", () => {
  const reason = decodeRevertReason(nested(panicData));
  assert.equal(reason.kind, "panic");
  assert.equal(reason.panicCode, 0x11n);
  assert.match(reason.message, /0x11/);
});

test("decodeRevertReason decodes custom errors only with the ABI", () => {
  const withAbi = decodeRevertReason(nested(floatData), CREATE_FLOW_ERRORS_ABI);
  assert.equal(withAbi.kind, "custom");
  assert.equal(withAbi.errorName, "InsufficientFloat");
  assert.deepEqual(withAbi.args, [10n, 3n]);

  const withoutAbi = decodeRevertReason(nested(floatData));
  assert.equal(withoutAbi.kind, "unknown");
  assert.equal(withoutAbi.data, floatData);
});

test("decodeRevertReason accepts an already decoded viem errorName", () => {
  const inner = Object.assign(new Error("reverted"), { data: { errorName: "StableNotAccepted", args: [stable] } });
  const reason = decodeRevertReason(new Error("outer", { cause: inner }));
  assert.equal(reason.kind, "custom");
  assert.equal(reason.errorName, "StableNotAccepted");
});

test("decodeRevertReason falls back to unknown with the error text", () => {
  const reason = decodeRevertReason(new Error("something odd"));
  assert.equal(reason.kind, "unknown");
  assert.equal(reason.message, "something odd");
});

test("decodeRevertReason reads revert bytes from a real viem client error", async () => {
  const client = createPublicClient({
    transport: custom({
      async request({ method }) {
        if (method === "eth_call") {
          throw Object.assign(new Error("execution reverted"), { code: 3, data: errorStringData });
        }
        throw new Error(`unexpected ${method}`);
      },
    }),
  });
  const result = await preflightTx(client, tx);
  assert.equal(result.ok, false);
  assert.equal(result.reason.kind, "error");
  assert.equal(result.reason.message, "token name taken");
});

test("isDailyLimitRevert matches the DailyCapExceeded name and selector only", () => {
  assert.equal(toFunctionSelector("DailyCapExceeded(address)"), dailyCapData.slice(0, 10));
  assert.equal(isDailyLimitRevert(decodeRevertReason(nested(dailyCapData), CREATE_FLOW_ERRORS_ABI)), true);
  assert.equal(isDailyLimitRevert(decodeRevertReason(nested(dailyCapData))), true); // selector alone
  assert.equal(isDailyLimitRevert(decodeRevertReason(nested(floatData), CREATE_FLOW_ERRORS_ABI)), false);
  assert.equal(isDailyLimitRevert(decodeRevertReason(nested(errorStringData))), false);
});

test("preflightTx: ok path returns estimate and 1.2x gas", async () => {
  const { client, calls } = mockClient({ estimate: 250001n });
  const result = await preflightTx(client, tx);
  assert.deepEqual(result, { ok: true, estimate: 250001n, gas: 300002n });
  assert.deepEqual(calls, { call: 1, estimateGas: 1 });
});

test("preflightTx: an eth_call revert skips estimateGas", async () => {
  const { client, calls } = mockClient({ call: nested(errorStringData), estimate: 1n });
  const result = await preflightTx(client, tx);
  assert.equal(result.ok, false);
  assert.equal(result.reason.message, "token name taken");
  assert.deepEqual(calls, { call: 1, estimateGas: 0 });
});

test("preflightTx: an estimateGas-only revert is reported with the ABI-decoded reason", async () => {
  const { client } = mockClient({ estimate: nested(dailyCapData) });
  const result = await preflightTx(client, tx, { abi: CREATE_FLOW_ERRORS_ABI });
  assert.equal(result.ok, false);
  assert.equal(result.reason.errorName, "DailyCapExceeded");
});

test("preflightTx: a transport failure is rethrown, not reported as a revert", async () => {
  const down = Object.assign(new Error("HTTP request failed."), { name: "HttpRequestError" });
  const { client } = mockClient({ call: down, estimate: 1n });
  await assert.rejects(preflightTx(client, tx), /HTTP request failed/);
});

test("preflightAndSend: sends with buffered gas when the simulation passes", async () => {
  const { client } = mockClient({ estimate: 1000n });
  const sent = [];
  const hash = await preflightAndSend(
    client,
    async (t) => {
      sent.push(t);
      return "0xabc";
    },
    tx,
  );
  assert.equal(hash, "0xabc");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].gas, 1200n);
  assert.equal(sent[0].to, factory);
  assert.equal(sent[0].value, 5n);
});

test("preflightAndSend: on revert send is never called and TxPreflightError carries the reason", async () => {
  const { client } = mockClient({ call: nested(floatData) });
  let sends = 0;
  await assert.rejects(
    preflightAndSend(client, async () => (sends += 1, "0xabc"), tx, { abi: CREATE_FLOW_ERRORS_ABI }),
    (err) => {
      assert.ok(err instanceof TxPreflightError);
      assert.equal(err.reason.errorName, "InsufficientFloat");
      return true;
    },
  );
  assert.equal(sends, 0);
});

test("create form wires the preflight before both sends and shows the localized error", () => {
  const src = readFileSync(join(root, "src/components/factory/EvmTokenLaunch.tsx"), "utf8");
  assert.match(src, /preflightAndSend/);
  assert.match(src, /sendChecked\(request\)/);
  assert.match(src, /functionName: "payLaunchFee"/);
  assert.match(src, /err instanceof TxPreflightError/);
  assert.doesNotMatch(src, /await writeViaActiveSigner\(signer, \{ \.\.\.request \}\)/);
});

test("preflight copy: every locale has all keys, placeholder and a PPL hint", () => {
  const langs = ["ar", "de", "en", "es", "fr", "id", "it", "pt", "ru", "tr", "vi", "zh"];
  const base = JSON.parse(readFileSync(join(root, "src/lib/locales/surfaces/tx-preflight-en.json"), "utf8"));
  for (const lang of langs) {
    const file = join(root, `src/lib/locales/surfaces/tx-preflight-${lang}.json`);
    const copy = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(base).sort(), lang);
    for (const value of Object.values(copy)) assert.ok(typeof value === "string" && value.length > 10, lang);
    assert.ok(copy.preflightRevert.includes("{reason}"), `${lang} placeholder`);
    assert.ok(copy.preflightPayInPplHint.includes("PPL"), `${lang} PPL hint`);
    assert.ok(copy.preflightDailyLimit.includes("PPL"), `${lang} daily limit offers PPL`);
    assert.equal(txPreflightCopy[lang].preflightRevert, copy.preflightRevert);
  }
});

test("preflightErrorMessage: daily cap, decoded reason, PPL hint for stable payers", () => {
  const t = txPreflightCopy.en;
  const daily = decodeRevertReason(nested(dailyCapData), CREATE_FLOW_ERRORS_ABI);
  assert.equal(preflightErrorMessage(daily, t, { payingWithStable: true }), t.preflightDailyLimit);

  const reverted = decodeRevertReason(nested(errorStringData));
  const ppl = preflightErrorMessage(reverted, t, { payingWithStable: false });
  assert.match(ppl, /token name taken/);
  assert.doesNotMatch(ppl, /switch to paying in PPL/);
  assert.match(preflightErrorMessage(reverted, t, { payingWithStable: true }), /switch to paying in PPL/);

  const unknown = decodeRevertReason(new Error("raw node noise 0x"));
  const text = preflightErrorMessage(unknown, t, { payingWithStable: false });
  assert.equal(text, t.preflightRevertGeneric);
  assert.doesNotMatch(text, /raw node noise/);
});
