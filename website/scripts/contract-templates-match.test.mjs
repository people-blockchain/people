import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTRACT_TEMPLATES, findTemplateById, matchTemplate } from "../src/lib/contract-templates.ts";
import { compileSoliditySync } from "../src/lib/solidity-compiler.ts";
import { lookupPrecompiledTemplate } from "../src/lib/contract-precompiled.ts";
import { contractCopy } from "../src/lib/contract-copy.ts";

test("template ids are unique and crowdfund is registered", () => {
  const ids = CONTRACT_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(findTemplateById("crowdfund"));
});

test("crowdfund phrases match the crowdfund template", () => {
  for (const phrase of [
    "crowdfund goal with refund",
    "Crowdfunding campaign: raise money, refund if the goal is missed",
    "fundraise for my project and invest the proceeds",
    "сбор денег с возвратом",
    "Краудфандинг: собрать средства, при недоборе вернуть",
    "сбор средств на проект, возврат если цель не достигнута"
  ]) {
    assert.equal(matchTemplate(phrase).id, "crowdfund", phrase);
  }
});

test("other templates still match their phrases", () => {
  const cases = {
    "release my team's tokens evenly over 12 months, vesting with cliff": "vesting",
    "linear vesting for the founders": "vesting",
    "вестинг токенов команды с клиффом": "vesting",
    "stake tokens and earn rewards": "staking",
    "стейкинг с наградами": "staking",
    "airdrop with a merkle claim": "airdrop",
    "escrow: hold a payment until both sides confirm": "escrow",
    "эскроу сделка с условным платежом": "escrow",
    "multisig wallet with threshold of owners": "multisig",
    "мультиподпись для казны": "multisig",
    "dao governor with proposal and vote": "dao",
    "голосование dao": "dao",
    "timelock with a delay": "timelock",
    "таймлок с задержкой": "timelock"
  };
  for (const [phrase, id] of Object.entries(cases)) {
    assert.equal(matchTemplate(phrase).id, id, phrase);
  }
});

test("Latin keywords match word starts only (invest does not hit vest)", () => {
  assert.equal(matchTemplate("invest in my startup").id, CONTRACT_TEMPLATES[0].id);
  assert.equal(matchTemplate("crowdfund to invest in a startup").id, "crowdfund");
});

test("crowdfund template compiles and matches its precompiled artifact", () => {
  const template = findTemplateById("crowdfund");
  const output = compileSoliditySync(template.fileName, template.source);
  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  assert.deepEqual(errors, []);
  const contract = output.contracts[template.fileName].SimpleCrowdfund;
  assert.ok(contract.evm.bytecode.object);
  const names = contract.abi.filter((i) => i.type === "function").map((i) => i.name);
  for (const fn of ["contribute", "claim", "refund", "raised", "contributions", "goal", "deadline"]) {
    assert.ok(names.includes(fn), fn);
  }
  assert.ok(lookupPrecompiledTemplate("crowdfund", template.source, template.fileName));
});

test("wizard copy has crowdfund prefill and goal label in every locale with identical keys", () => {
  const base = Object.keys(contractCopy.en).sort();
  const fieldBase = Object.keys(contractCopy.en.fields).sort();
  assert.equal(Object.keys(contractCopy).length, 12);
  for (const [lang, copy] of Object.entries(contractCopy)) {
    assert.deepEqual(Object.keys(copy).sort(), base, lang);
    assert.deepEqual(Object.keys(copy.fields).sort(), fieldBase, lang);
    assert.ok(copy.crowdfundPrompt.length >= 8, lang);
    assert.ok(copy.fields.goal, lang);
  }
});
