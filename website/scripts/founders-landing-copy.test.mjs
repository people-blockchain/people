import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = join(root, "src/lib/locales/surfaces");
const load = (name) => JSON.parse(readFileSync(join(surfaces, name), "utf8"));

function shape(obj) {
  if (Array.isArray(obj)) return obj.map(shape);
  if (obj && typeof obj === "object") return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, shape(obj[k])]));
  return typeof obj;
}

test("founders landing RU matches EN structure", () => {
  assert.deepEqual(shape(load("founders-landing-ru.json")), shape(load("founders-landing-en.json")));
});

test("founders landing carries agreed hero titles and FAQ", () => {
  const en = load("founders-landing-en.json");
  const ru = load("founders-landing-ru.json");
  assert.equal(en.heroTitle, "Million Founders");
  assert.equal(ru.heroTitle, "Миллион основателей");
  assert.equal(en.faq.length, 5);
  assert.equal(ru.faq.length, 5);
  assert.ok(en.faq.some((item) => /payout/i.test(item.q)));
  assert.ok(en.faq.some((item) => /free/i.test(item.q)));
});

test("founders landing copy avoids jargon", () => {
  for (const name of ["founders-landing-en.json", "founders-landing-ru.json"]) {
    const text = readFileSync(join(surfaces, name), "utf8");
    assert.doesNotMatch(text, /VRF|soulbound|Merkle/i, name);
  }
});

test("founders landing lists every special number and the fixed one-time bonus", () => {
  for (const name of ["founders-landing-en.json", "founders-landing-ru.json"]) {
    const c = load(name);
    assert.equal(c.specialList.length, 5, name);
    assert.equal(c.specialPerks.length, 4, name);
    const list = c.specialList.join(" ");
    for (const n of ["77", "888", "8888", "12345", "500"]) assert.ok(list.includes(n), `${name} lists ${n}`);
    assert.ok(c.specialPerks.some((p) => /7/.test(p)), `${name} mentions 7-day early access`);
    assert.ok(c.specialFixedNote.length > 0 && c.specialNamedBadge.length > 0, name);
    const text = JSON.stringify(c);
    assert.doesNotMatch(text, /\bsoon\b|скоро|guaranteed return/i, name);
    assert.doesNotMatch(text, /\bPeople\b(?! Predict)/, `${name} brand must be PEOPLE in caps`);
  }
});
