#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";

import { hubGateStatus } from "../src/lib/sale/hub-read.ts";

test("hubGateStatus: openedAt zero means not_open", () => {
  assert.equal(
    hubGateStatus({
      openedAt: 0n,
      isActive: false,
      paused: false,
      graduated: false,
      closesAt: 0n,
      soldPplWei: 0n,
      raisedUsd6: 0n,
    }),
    "not_open",
  );
});

test("hubGateStatus: null snapshot fails closed as unavailable", () => {
  assert.equal(hubGateStatus(null), "unavailable");
});

test("hubGateStatus: isActive with openedAt is open", () => {
  const nowSec = Math.floor(Date.now() / 1000) + 60;
  const openedAt = BigInt(nowSec - 3600);
  const closesAt = BigInt(nowSec + 180 * 86_400);
  assert.equal(
    hubGateStatus(
      {
        openedAt,
        isActive: true,
        paused: false,
        graduated: false,
        closesAt,
        soldPplWei: 0n,
        raisedUsd6: 0n,
      },
      nowSec,
    ),
    "open",
  );
});
