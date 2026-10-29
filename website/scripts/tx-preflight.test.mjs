import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, encodeErrorResult, parseAbi } from "viem";
import { TxPreflightError, preflightAndSend, preflightTx, withGasBuffer } from "../src/lib/evm/tx-preflight.ts";
import { preflightWriteContract } from "../src/lib/evm/preflight-write.ts";
import { describePreflightError } from "../src/lib/tx-preflight-copy.ts";

const ACCOUNT = "0x00000000000000000000000000000000000000a1";
const TO = "0x00000000000000000000000000000000000000b2";
const HASH = `0x${"ab".repeat(32)}`;
const abi = parseAbi(["function pay(uint256 amount)"]);

/** viem-like revert error: wraps the raw revert data the way a node reply surfaces it. */
function revertError(data) {
  const inner = Object.assign(new Error("execution reverted"), { name: "RpcRequestError", data });
  return Object.assign(new Error("The contract function reverted."), { name: "CallExecutionError", cause: inner });
}

function mockClient({ callError, estimateError, estimate = BigInt(100_000) } = {}) {
  const log = [];
  return {
    log,
    client: {
      call: async () => {
        log.push("call");
        if (callError) throw callError;
        return { data: "0x" };
      },
      estimateGas: async () => {
        log.push("estimateGas");
        if (estimateError) throw estimateError;
        return estimate;
      },
    },
  };
}

test("withGasBuffer is estimate * 1.2 rounded up", () => {
  assert.equal(withGasBuffer(BigInt(100_000)), BigInt(120_000));
  assert.equal(withGasBuffer(BigInt(21_001)), BigInt(25_202));
});

test("success: simulate, estimate, then send with gas = estimate * 1.2", async () => {
  const { client, log } = mockClient({ estimate: BigInt(50_000) });
  const sent = [];
  const hash = await preflightAndSend(
    client,
    async (tx) => {
      log.push("send");
      sent.push(tx);
      return HASH;
    },
    { account: ACCOUNT, to: TO, data: "0x1234", value: BigInt(7) },
  );
  assert.equal(hash, HASH);
  assert.deepEqual(log, ["call", "estimateGas", "send"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].gas, BigInt(60_000));
  assert.equal(sent[0].to, TO);
  assert.equal(sent[0].value, BigInt(7));
});

test("contract write: encodes the call and passes the buffered gas to the writer", async () => {
  const { client } = mockClient({ estimate: BigInt(80_000) });
  let gasSeen;
  const hash = await preflightWriteContract(
    client,
    ACCOUNT,
    { address: TO, abi, functionName: "pay", args: [BigInt(5)] },
    async (gas) => {
      gasSeen = gas;
      return HASH;
    },
  );
  assert.equal(hash, HASH);
  assert.equal(gasSeen, BigInt(96_000));
});

test("revert on simulate: send is never called, error is a classified TxPreflightError", async () => {
  const data = encodeErrorResult({
    abi: parseAbi(["error DailyCapExceeded(address account)"]),
    errorName: "DailyCapExceeded",
    args: [ACCOUNT],
  });
  const { client, log } = mockClient({ callError: revertError(data) });
  let sendCalls = 0;
  await assert.rejects(
    preflightAndSend(
      client,
      async () => {
        sendCalls += 1;
        return HASH;
      },
      { account: ACCOUNT, to: TO, data: "0x1234" },
    ),
    (err) => {
      assert.ok(err instanceof TxPreflightError);
      assert.equal(err.reason.kind, "custom");
      assert.equal(err.reason.errorName, "DailyCapExceeded");
      const friendly = describePreflightError(err, "en");
      assert.ok(friendly);
      assert.equal(friendly.offerPpl, true);
      assert.match(friendly.text, /no gas was spent/);
      return true;
    },
  );
  assert.equal(sendCalls, 0);
  assert.deepEqual(log, ["call"], "estimateGas is skipped after a failed simulation");
});

test("revert on estimateGas alone also blocks the send; Error(string) reason is decoded", async () => {
  const data = `0x08c379a0${encodeAbiParameters([{ type: "string" }], ["Slippage"]).slice(2)}`;
  const { client } = mockClient({ estimateError: revertError(data) });
  const result = await preflightTx(client, { account: ACCOUNT, to: TO, data: "0x" });
  assert.equal(result.ok, false);
  assert.equal(result.reason.kind, "error");
  assert.equal(result.reason.message, "Slippage");
  const friendly = describePreflightError(new TxPreflightError(result.reason), "en");
  assert.match(friendly.text, /Slippage/);
  assert.equal(friendly.offerPpl, false);
});

test("non-revert failures (RPC down) are rethrown unchanged and nothing is sent", async () => {
  const boom = new Error("network down");
  const { client } = mockClient({ callError: boom });
  let sendCalls = 0;
  await assert.rejects(
    preflightAndSend(client, async () => (sendCalls += 1, HASH), { account: ACCOUNT, to: TO }),
    (err) => err === boom,
  );
  assert.equal(sendCalls, 0);
  assert.equal(describePreflightError(boom, "en"), null);
});
