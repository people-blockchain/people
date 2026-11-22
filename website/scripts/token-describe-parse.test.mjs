import test from "node:test";
import assert from "node:assert/strict";
import { parseTokenDescriptionHeuristic, containsFundraisingPromise } from "../src/lib/token-describe-parse.ts";
import { formatSpotPpl } from "../src/lib/token-curve-start-price.ts";

test("heuristic fills coffee channel example", () => {
  const text =
    "I want a token for my Telegram coffee channel, 1 million tokens so subscribers can support the channel.";
  const r = parseTokenDescriptionHeuristic(text);
  assert.ok(r);
  assert.equal(r.supply, "1000000");
  assert.match(r.name, /coffee|Telegram|Channel/i);
  assert.ok(r.symbol.length >= 2);
  assert.ok(r.price.spotPplPerWholeToken > 0);
});

test("fundraising promises are flagged", () => {
  assert.equal(containsFundraisingPromise("We will raise $1M from the curve"), true);
  const r = parseTokenDescriptionHeuristic("Launch COFFEE with 2 million tokens, raise $1M guaranteed");
  assert.ok(r?.warnings.includes("fundraising_not_guaranteed"));
});

test("formatSpotPpl renders small values", () => {
  assert.match(formatSpotPpl(0.0001), /0\.0001/);
});

test("heuristic spot follows promo bps", () => {
  const text =
    "I want a token for my Telegram coffee channel, 1 million tokens so subscribers can support the channel.";
  const none = parseTokenDescriptionHeuristic(text, 0);
  const promo = parseTokenDescriptionHeuristic(text, 1000);
  assert.ok(none && promo);
  assert.ok(promo.price.spotPplPerWholeToken > none.price.spotPplPerWholeToken);
});