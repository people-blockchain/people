// The sample-contracts-artifacts.json committed in src/lib/generated is generated from forge
// build output by generate-sample-contract-artifacts.mjs. This guards against it drifting from
// the actual .sol sources (e.g. someone editing one without regenerating the other), and checks
// the deploy-data encoder used by the /explorer/contracts "deploy with my wallet" UI.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAddress, zeroAddress } from "viem";
import { sampleTemplate, sampleTemplates, testStablecoinAbi, PAY_ASSETS, SAMPLE_TEMPLATE_IDS } from "../src/lib/sample-contracts.ts";
import { defaultSampleArgs, encodeSampleArgs, parseSampleValuePpl, parseSampleAmount } from "../src/lib/sample-contract-deploy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const samplesSrcDir = join(root, "contracts", "src", "samples");

test("generated artifact source matches the live .sol file for every template", () => {
  for (const template of sampleTemplates()) {
    const live = readFileSync(join(samplesSrcDir, template.fileName), "utf8");
    assert.equal(template.source, live, `${template.id} source drifted from ${template.fileName}`);
  }
});

test("every template has non-empty ABI and bytecode", () => {
  for (const template of sampleTemplates()) {
    assert.ok(Array.isArray(template.abi) && template.abi.length > 0, template.id);
    assert.match(template.bytecode, /^0x[0-9a-fA-F]+$/, template.id);
  }
});

test("every template has a deployed testnet address (or empty when not deployed)", () => {
  for (const id of SAMPLE_TEMPLATE_IDS) {
    assert.match(sampleTemplate(id).testnetAddress, /^(0x[0-9a-fA-F]{40})?$/, id);
  }
});

test("encodeSampleArgs builds deploy data for escrow in native PPL mode", () => {
  const template = sampleTemplate("escrow");
  const buyer = getAddress("0x1111111111111111111111111111111111111111");
  const arbiter = getAddress("0x2222222222222222222222222222222222222222");
  const result = encodeSampleArgs(
    template,
    { seller_: buyer, arbiter_: arbiter, token_: zeroAddress, amount_: "1" },
    { amount_: 18 }
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.data.startsWith(template.bytecode));
    assert.ok(result.data.toLowerCase().includes(buyer.slice(2).toLowerCase()));
  }
});

test("encodeSampleArgs builds deploy data for escrow in ERC20 mode with a 6-decimal amount", () => {
  const template = sampleTemplate("escrow");
  const buyer = getAddress("0x1111111111111111111111111111111111111111");
  const arbiter = getAddress("0x2222222222222222222222222222222222222222");
  const token = getAddress("0x3333333333333333333333333333333333333333");
  const result = encodeSampleArgs(
    template,
    { seller_: buyer, arbiter_: arbiter, token_: token, amount_: "100" },
    { amount_: 6 }
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.data.toLowerCase().includes((100_000_000n).toString(16)));
  }
});

test("encodeSampleArgs rejects a bad address", () => {
  const template = sampleTemplate("escrow");
  const result = encodeSampleArgs(template, {
    seller_: "not-an-address",
    arbiter_: "0x2222222222222222222222222222222222222222",
    token_: zeroAddress,
    amount_: "1",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.field, "seller_");
    assert.equal(result.reason, "address");
  }
});

test("encodeSampleArgs handles the ERC20 template's string args", () => {
  const template = sampleTemplate("erc20");
  const result = encodeSampleArgs(template, { name_: "Sample Token", symbol_: "SMPL", supply_: "1000000" });
  assert.equal(result.ok, true);
});

test("encodeSampleArgs scales the ERC20 total supply from whole tokens to base units", () => {
  const template = sampleTemplate("erc20");
  const result = encodeSampleArgs(template, { name_: "Sample Token", symbol_: "SMPL", supply_: "1.5" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.data.toLowerCase().includes((1_500_000_000_000_000_000n).toString(16)));
  }
});

test("encodeSampleArgs scales the crowdfund goal from PPL to wei", () => {
  const template = sampleTemplate("crowdfund");
  const result = encodeSampleArgs(
    template,
    { goal_: "2", durationSeconds_: "100", token_: zeroAddress },
    { goal_: 18 }
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.data.toLowerCase().includes((2_000_000_000_000_000_000n).toString(16)));
  }
});

test("encodeSampleArgs scales the crowdfund goal by the chosen stablecoin's decimals", () => {
  const template = sampleTemplate("crowdfund");
  const token = getAddress("0x3333333333333333333333333333333333333333");
  const result = encodeSampleArgs(
    template,
    { goal_: "2", durationSeconds_: "100", token_: token },
    { goal_: 6 }
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.data.toLowerCase().includes((2_000_000n).toString(16)));
  }
});

test("encodeSampleArgs scales the vesting duration from days to seconds", () => {
  const template = sampleTemplate("vesting");
  const beneficiary = getAddress(`0x${"33".repeat(20)}`);
  const result = encodeSampleArgs(template, { beneficiary_: beneficiary, start_: "1700000000", duration_: "7" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.data.toLowerCase().includes((604800n).toString(16).padStart(2, "0")));
  }
});

test("encodeSampleArgs rejects an empty string field", () => {
  const template = sampleTemplate("erc20");
  const result = encodeSampleArgs(template, { name_: "", symbol_: "SMPL", supply_: "1" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "text");
});

test("encodeSampleArgs rejects a non-integer day count", () => {
  const template = sampleTemplate("vesting");
  const beneficiary = getAddress(`0x${"33".repeat(20)}`);
  const result = encodeSampleArgs(template, { beneficiary_: beneficiary, start_: "1700000000", duration_: "1.5" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "number");
});

test("encodeSampleArgs rejects a non-integer uint256 with no scale", () => {
  const template = sampleTemplate("crowdfund");
  const result = encodeSampleArgs(template, { goal_: "2", durationSeconds_: "1.5", token_: zeroAddress }, { goal_: 18 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "number");
});

test("defaultSampleArgs prefills address fields with the wallet address and start with now", () => {
  const wallet = getAddress(`0x${"44".repeat(20)}`);
  const escrow = defaultSampleArgs(sampleTemplate("escrow"), wallet);
  assert.equal(escrow.seller_, wallet);
  assert.equal(escrow.arbiter_, wallet);

  const before = Math.floor(Date.now() / 1000);
  const vesting = defaultSampleArgs(sampleTemplate("vesting"), wallet);
  assert.equal(vesting.beneficiary_, wallet);
  assert.ok(Number(vesting.start_) >= before);
  assert.equal(vesting.duration_, undefined);

  const noWallet = defaultSampleArgs(sampleTemplate("escrow"), undefined);
  assert.equal(noWallet.seller_, undefined);
});

test("parseSampleValuePpl parses decimal PPL into wei", () => {
  assert.equal(parseSampleValuePpl("1"), 1_000_000_000_000_000_000n);
  assert.equal(parseSampleValuePpl("0.5"), 500_000_000_000_000_000n);
  assert.equal(parseSampleValuePpl("0"), null);
  assert.equal(parseSampleValuePpl("-1"), null);
  assert.equal(parseSampleValuePpl("abc"), null);
});

test("parseSampleAmount scales by the given decimals", () => {
  assert.equal(parseSampleAmount("100", 6), 100_000_000n);
  assert.equal(parseSampleAmount("1.5", 18), 1_500_000_000_000_000_000n);
  assert.equal(parseSampleAmount("0", 6), null);
  assert.equal(parseSampleAmount("abc", 6), null);
});

test("PAY_ASSETS lists native PPL plus the two testnet mock stablecoins", () => {
  const ids = PAY_ASSETS.map((a) => a.id);
  assert.deepEqual(ids, ["PPL", "tUSDC", "tUSDT"]);
  const ppl = PAY_ASSETS.find((a) => a.id === "PPL");
  assert.equal(ppl.address, zeroAddress);
  assert.equal(ppl.decimals, 18);
  for (const stable of PAY_ASSETS.filter((a) => a.id !== "PPL")) {
    assert.equal(stable.decimals, 6);
    assert.match(stable.address, /^0x[0-9a-fA-F]{40}$/);
  }
});

test("escrow and crowdfund templates support the pay-asset selector; vesting and erc20 don't", () => {
  assert.equal(sampleTemplate("escrow").supportsPayAsset, true);
  assert.equal(sampleTemplate("crowdfund").supportsPayAsset, true);
  assert.equal(sampleTemplate("vesting").supportsPayAsset, false);
  assert.equal(sampleTemplate("erc20").supportsPayAsset, false);
});

test("testStablecoinAbi exposes the faucet mint() function", () => {
  const abi = testStablecoinAbi();
  assert.ok(abi.some((entry) => entry.type === "function" && entry.name === "mint"));
});
