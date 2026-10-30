// Crowdfund campaign page: state/actions, countdown, chain reads (mock client), preflighted sends
// (mock client) and the days + hours duration input. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { encodeErrorResult, parseAbi } from "viem";
import {
  CROWDFUND_ABI,
  CampaignReadError,
  buildCampaignRequest,
  countdownParts,
  deriveCampaign,
  formatCountdown,
  parseContribution,
  readCampaign,
} from "../src/lib/crowdfund/campaign.ts";
import { crowdfundCopy } from "../src/lib/crowdfund/campaign-copy.ts";
import { preflightWriteContract } from "../src/lib/evm/preflight-write.ts";
import { TxPreflightError } from "../src/lib/evm/tx-preflight.ts";
import {
  constructorFields,
  defaultFieldValue,
  encodeConstructorArgs,
  parseDaysHours,
  splitDaysHours,
} from "../src/lib/contract-constructor.ts";
import { lookupPrecompiledTemplate } from "../src/lib/contract-precompiled.ts";
import { findTemplateById } from "../src/lib/contract-templates.ts";

const CAMPAIGN = "0xBA186935b0eD3F3AE7Ab36551A35B7db41939c3e";
const CREATOR = "0x00000000000000000000000000000000000000c1";
const BACKER = "0x00000000000000000000000000000000000000b2";
const PPL = (n) => BigInt(n) * 10n ** 18n;
const HASH = `0x${"cd".repeat(32)}`;

const snap = (over = {}) => ({
  address: CAMPAIGN,
  owner: CREATOR,
  goal: PPL(100),
  deadline: 2_000n,
  raised: PPL(10),
  claimed: false,
  contribution: 0n,
  now: 1_000n,
  ...over,
});

test("open campaign: contribute only; progress and countdown", () => {
  const v = deriveCampaign(snap(), BACKER);
  assert.equal(v.status, "open");
  assert.equal(v.percent, 10);
  assert.equal(v.secondsLeft, 1000);
  assert.deepEqual([v.canContribute, v.canClaim, v.canRefund], [true, false, false]);
});

test("goal reached: only the creator can claim, backers cannot; contributions stay open until the deadline", () => {
  const raised = PPL(120);
  const creator = deriveCampaign(snap({ raised }), CREATOR.toUpperCase().replace("0X", "0x"));
  assert.equal(creator.status, "reached");
  assert.equal(creator.percent, 120);
  assert.equal(creator.barPercent, 100);
  assert.deepEqual([creator.canContribute, creator.canClaim, creator.canRefund], [true, true, false]);
  const backer = deriveCampaign(snap({ raised, contribution: PPL(5) }), BACKER);
  assert.deepEqual([backer.canClaim, backer.canRefund], [false, false]);
  assert.equal(deriveCampaign(snap({ raised })).canClaim, false, "no wallet connected");
});

test("goal reached after the deadline: claim is still open, contributions are closed", () => {
  const v = deriveCampaign(snap({ raised: PPL(100), now: 2_000n }), CREATOR);
  assert.deepEqual([v.status, v.ended, v.canContribute, v.canClaim], ["reached", true, false, true]);
  assert.equal(v.secondsLeft, 0);
});

test("claimed campaign: nothing left to do", () => {
  const v = deriveCampaign(snap({ raised: PPL(100), claimed: true, now: 3_000n, contribution: PPL(1) }), CREATOR);
  assert.deepEqual([v.status, v.canContribute, v.canClaim, v.canRefund], ["claimed", false, false, false]);
});

test("goal missed after the deadline: refund only for someone who contributed", () => {
  const withMoney = deriveCampaign(snap({ now: 2_500n, contribution: PPL(3) }), BACKER);
  assert.deepEqual([withMoney.status, withMoney.canRefund, withMoney.canContribute], ["failed", true, false]);
  assert.equal(deriveCampaign(snap({ now: 2_500n }), BACKER).canRefund, false);
  assert.equal(deriveCampaign(snap({ now: 2_500n, contribution: PPL(3) }), BACKER).canClaim, false);
  // Before the deadline a refund would revert ("wait"), so the button stays off.
  assert.equal(deriveCampaign(snap({ now: 1_999n, contribution: PPL(3) }), BACKER).canRefund, false);
});

test("countdown parts and formatting", () => {
  assert.deepEqual(countdownParts(2 * 86_400 + 3 * 3_600 + 4 * 60 + 5), { d: 2, h: 3, m: 4, s: 5 });
  const units = { dayShort: "d", hourShort: "h", minShort: "m", secShort: "s" };
  assert.equal(formatCountdown(2 * 86_400 + 3 * 3_600 + 4 * 60 + 5, units), "2d 3h 4m 5s");
  assert.equal(formatCountdown(65, units), "1m 5s");
  assert.equal(formatCountdown(0, units), "0s");
  assert.equal(formatCountdown(-5, units), "0s");
});

test("contribution amounts: decimals, comma, rejects empty/zero/garbage", () => {
  assert.equal(parseContribution("1.5"), PPL(1) + PPL(1) / 2n);
  assert.equal(parseContribution("0,25"), PPL(1) / 4n);
  for (const bad of ["", "0", "-1", "abc", "1e3", "0.0000000000000000001"]) {
    assert.equal(parseContribution(bad), null, bad);
  }
});

test("write requests target the campaign with the right function and value", () => {
  const contribute = buildCampaignRequest("contribute", CAMPAIGN, PPL(2));
  assert.deepEqual(
    [contribute.functionName, contribute.value, contribute.address, contribute.abi === CROWDFUND_ABI],
    ["contribute", PPL(2), CAMPAIGN, true],
  );
  for (const action of ["claim", "refund"]) {
    const req = buildCampaignRequest(action, CAMPAIGN);
    assert.equal(req.functionName, action);
    assert.equal(req.value, undefined);
  }
  assert.throws(() => buildCampaignRequest("contribute", CAMPAIGN), RangeError);
  assert.throws(() => buildCampaignRequest("contribute", CAMPAIGN, 0n), RangeError);
});

function readClient({ code = "0x6080", fail, values = {} } = {}) {
  const calls = [];
  const data = { goal: PPL(100), deadline: 2_000n, raised: PPL(10), claimed: false, owner: CREATOR, contributions: PPL(4), ...values };
  return {
    calls,
    client: {
      getCode: async () => code,
      getBlock: async () => ({ timestamp: 1_000n }),
      readContract: async ({ functionName, args }) => {
        calls.push([functionName, args]);
        if (fail) throw fail;
        return data[functionName];
      },
    },
  };
}

test("readCampaign reads all fields (test campaign layout) and the account's contribution", async () => {
  const { client, calls } = readClient();
  const s = await readCampaign(client, CAMPAIGN, BACKER);
  assert.deepEqual(
    [s.goal, s.deadline, s.raised, s.claimed, s.owner, s.contribution, s.now],
    [PPL(100), 2_000n, PPL(10), false, CREATOR, PPL(4), 1_000n],
  );
  assert.deepEqual(calls.find(([name]) => name === "contributions"), ["contributions", [BACKER]]);
});

test("readCampaign without an account does not query contributions", async () => {
  const { client, calls } = readClient();
  const s = await readCampaign(client, CAMPAIGN, null);
  assert.equal(s.contribution, 0n);
  assert.equal(calls.some(([name]) => name === "contributions"), false);
});

test("readCampaign classifies bad input, non-campaigns and network failures", async () => {
  const reason = async (promise) => {
    try {
      await promise;
    } catch (error) {
      assert.ok(error instanceof CampaignReadError);
      return error.reason;
    }
    return "no error";
  };
  assert.equal(await reason(readCampaign(readClient().client, "0x123")), "invalid_address");
  assert.equal(await reason(readCampaign(readClient({ code: "0x" }).client, CAMPAIGN)), "not_campaign");
  const zeroData = Object.assign(new Error("returned no data"), {
    name: "ContractFunctionExecutionError",
    cause: Object.assign(new Error("zero data"), { name: "ContractFunctionZeroDataError" }),
  });
  assert.equal(await reason(readCampaign(readClient({ fail: zeroData }).client, CAMPAIGN)), "not_campaign");
  const timeout = Object.assign(new Error("timeout"), {
    name: "ContractFunctionExecutionError",
    cause: Object.assign(new Error("request timed out"), { name: "TimeoutError" }),
  });
  assert.equal(await reason(readCampaign(readClient({ fail: timeout }).client, CAMPAIGN)), "load_failed");
});

function preflightClient({ callError, estimate = 90_000n } = {}) {
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
        return estimate;
      },
    },
  };
}

test("campaign sends go through the preflight: simulate, estimate, then send with gas * 1.2", async () => {
  const { client, log } = preflightClient();
  const sent = [];
  const req = buildCampaignRequest("contribute", CAMPAIGN, PPL(1));
  const hash = await preflightWriteContract(client, BACKER, req, async (gas) => {
    log.push("send");
    sent.push(gas);
    return HASH;
  });
  assert.equal(hash, HASH);
  assert.deepEqual(log, ["call", "estimateGas", "send"]);
  assert.deepEqual(sent, [108_000n]);
});

test("a refund that would revert is never sent", async () => {
  const data = encodeErrorResult({ abi: parseAbi(["error Error(string)"]), errorName: "Error", args: ["wait"] });
  const inner = Object.assign(new Error("execution reverted"), { name: "RpcRequestError", data });
  const callError = Object.assign(new Error("reverted"), { name: "CallExecutionError", cause: inner });
  const { client } = preflightClient({ callError });
  let sends = 0;
  await assert.rejects(
    preflightWriteContract(client, BACKER, buildCampaignRequest("refund", CAMPAIGN), async () => {
      sends += 1;
      return HASH;
    }),
    (error) => error instanceof TxPreflightError,
  );
  assert.equal(sends, 0);
});

test("crowdfund duration is entered as days + hours", () => {
  const template = findTemplateById("crowdfund");
  const artifact = lookupPrecompiledTemplate("crowdfund", template.source, template.fileName);
  const fields = constructorFields(artifact.abi, "crowdfund");
  const duration = fields.find((f) => f.name === "duration_");
  assert.deepEqual([duration.kind, duration.labelKey], ["duration", "campaignDuration"]);
  assert.equal(defaultFieldValue(duration), "30:0");
  const enc = (value) => encodeConstructorArgs(fields, { goal_: "100", duration_: value });
  const secondsOf = (value) => {
    const r = enc(value);
    assert.ok(r.ok, value);
    return BigInt(`0x${r.hex.slice(64)}`);
  };
  assert.equal(secondsOf("3:12"), BigInt(3 * 86_400 + 12 * 3_600));
  assert.equal(secondsOf("0:1"), 3_600n);
  assert.equal(secondsOf("7:"), BigInt(7 * 86_400));
  assert.equal(secondsOf("5"), BigInt(5 * 86_400), "a bare number is days");
  for (const bad of ["0:0", ":", "", "1.5:0", "-1:2", "a:b"]) {
    assert.equal(enc(bad).ok, false, bad);
  }
  // Other templates keep their days field.
  const vesting = findTemplateById("vesting");
  const vestingAbi = lookupPrecompiledTemplate("vesting", vesting.source, vesting.fileName).abi;
  assert.equal(constructorFields(vestingAbi, "vesting").find((f) => f.name === "duration_").kind, "days");
  assert.equal(parseDaysHours("1:23"), BigInt(86_400 + 23 * 3_600));
  assert.deepEqual(splitDaysHours("3:12"), { days: "3", hours: "12" });
  assert.deepEqual(splitDaysHours("30"), { days: "30", hours: "" });
});

test("crowdfund copy has every key in all 12 locales, with the progress placeholder", () => {
  const languages = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
  const keys = Object.keys(crowdfundCopy.en).sort();
  for (const lang of languages) {
    const raw = JSON.parse(readFileSync(new URL(`../src/lib/locales/surfaces/crowdfund-${lang}.json`, import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(raw).sort(), keys, lang);
    for (const key of keys) assert.ok(String(raw[key]).trim().length > 0, `${lang}.${key}`);
    assert.ok(raw.progress.includes("{pct}"), lang);
    assert.deepEqual(Object.keys(crowdfundCopy[lang]).sort(), keys, lang);
  }
});
