// The governance "View transaction" link points at a Cosmos tx hash (64 hex, no 0x).
// These cover the hash check and the REST-payload flattening the explorer renders.
import test from "node:test";
import assert from "node:assert/strict";
import { isCosmosTxHash, summarizeCosmosTx, describeMessage } from "../src/lib/cosmos-tx.ts";

// Trimmed from GET /rest/cosmos/tx/v1beta1/txs/DD3EF7… for a governance vote.
const votePayload = {
  tx: {
    body: {
      messages: [
        {
          "@type": "/cosmos.gov.v1.MsgVote",
          proposal_id: "1",
          voter: "people15e99t3mcaxqtcmhv68rtz3t33lszgl2nt76nyw",
          option: "VOTE_OPTION_YES",
          metadata: "",
        },
      ],
      memo: "",
    },
    auth_info: { fee: { amount: [{ denom: "appl", amount: "10" }], gas_limit: "98597" } },
  },
  tx_response: {
    height: "34044",
    txhash: "DD3EF7EFFE9AC4C035D2487ED8B0B2234FB7E12428FC3A298C76CE2F9DDE2C70",
    code: 0,
    gas_wanted: "98597",
    gas_used: "76952",
    timestamp: "2026-10-09T03:08:32Z",
    tx: {
      body: {
        messages: [
          {
            "@type": "/cosmos.gov.v1.MsgVote",
            proposal_id: "1",
            voter: "people15e99t3mcaxqtcmhv68rtz3t33lszgl2nt76nyw",
            option: "VOTE_OPTION_YES",
            metadata: "",
          },
        ],
        memo: "",
      },
      auth_info: { fee: { amount: [{ denom: "appl", amount: "10" }], gas_limit: "98597" } },
    },
  },
};

test("cosmos hash detection: 64 hex without 0x, never an EVM hash", () => {
  assert.equal(isCosmosTxHash("DD3EF7EFFE9AC4C035D2487ED8B0B2234FB7E12428FC3A298C76CE2F9DDE2C70"), true);
  assert.equal(isCosmosTxHash("dd3ef7effe9ac4c035d2487ed8b0b2234fb7e12428fc3a298c76ce2f9dde2c70"), true);
  assert.equal(isCosmosTxHash("0xdd3ef7effe9ac4c035d2487ed8b0b2234fb7e12428fc3a298c76ce2f9dde2c70"), false);
  assert.equal(isCosmosTxHash("people15e99t3mcaxqtcmhv68rtz3t33lszgl2nt76nyw"), false);
  assert.equal(isCosmosTxHash("abc"), false);
});

test("vote tx flattens to height, time, success, message, fee and gas", () => {
  const tx = summarizeCosmosTx(votePayload);
  assert.ok(tx);
  assert.equal(tx.hash, "DD3EF7EFFE9AC4C035D2487ED8B0B2234FB7E12428FC3A298C76CE2F9DDE2C70");
  assert.equal(tx.height, 34044);
  assert.equal(tx.time, "2026-10-09T03:08:32Z");
  assert.equal(tx.success, true);
  assert.equal(tx.code, 0);
  assert.equal(tx.fee, "10 appl");
  assert.equal(tx.gasWanted, 98597);
  assert.equal(tx.gasUsed, 76952);
  assert.equal(tx.messages.length, 1);
  assert.equal(tx.messages[0].type, "MsgVote");
  // proposal / option / voter all readable
  assert.match(tx.messages[0].summary, /Yes/);
  assert.match(tx.messages[0].summary, /proposal #1/);
  assert.match(tx.messages[0].summary, /people15e99t3mcaxqtcmhv68rtz3t33lszgl2nt76nyw/);
});

test("non-zero code is reported as failed", () => {
  const failed = summarizeCosmosTx({
    tx_response: { ...votePayload.tx_response, code: 6 },
  });
  assert.ok(failed);
  assert.equal(failed.success, false);
  assert.equal(failed.code, 6);
});

test("malformed payload yields null; unknown messages fall back to their type", () => {
  assert.equal(summarizeCosmosTx(null), null);
  assert.equal(summarizeCosmosTx({}), null);
  assert.equal(summarizeCosmosTx({ tx_response: null }), null);
  const described = describeMessage({ "@type": "/cosmos.staking.v1beta1.MsgDelegate" });
  assert.equal(described.type, "MsgDelegate");
  assert.equal(described.summary, "MsgDelegate");
});
