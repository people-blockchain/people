import assert from "node:assert/strict";
import test from "node:test";
import {
  heroHeadlineCqiMultiplier,
  heroHeadlineMaxWordChars,
  heroHeadlineMaxWordCharsFromLines,
  heroHeadlineUsesWideGlyphs,
} from "../src/lib/hero-headline-scale.ts";

test("heroHeadlineMaxWordChars uses longest word across main and accent", () => {
  assert.equal(heroHeadlineMaxWordChars("БЛОКЧЕЙН", "ДЛЯ СООБЩЕСТВА"), 10);
  assert.equal(heroHeadlineMaxWordChars("BLOCKCHAIN", "FÜR DIE GEMEINSCHAFT"), 12);
  assert.equal(heroHeadlineMaxWordChars("PEOPLE", "BLOCKCHAIN"), 10);
});

test("heroHeadlineUsesWideGlyphs detects Cyrillic and Arabic", () => {
  assert.equal(heroHeadlineUsesWideGlyphs("БЛОКЧЕЙН", "ДЛЯ СООБЩЕСТВА"), true);
  assert.equal(heroHeadlineUsesWideGlyphs("PEOPLE", "BLOCKCHAIN"), false);
  assert.equal(heroHeadlineUsesWideGlyphs("بلوك تشين", "للمجتمع"), true);
});

test("heroHeadlineMaxWordCharsFromLines uses longest word on a single line", () => {
  assert.equal(
    heroHeadlineMaxWordCharsFromLines(["Launch a token", "for your", "community."]),
    10
  );
  assert.equal(heroHeadlineMaxWordCharsFromLines(["Запустите токен", "для своего", "сообщества."]), 11);
});

test("heroHeadlineCqiMultiplier is more conservative for long wide-script words", () => {
  const en = heroHeadlineCqiMultiplier(10, "PEOPLE", "BLOCKCHAIN");
  const ru = heroHeadlineCqiMultiplier(10, "БЛОКЧЕЙН", "ДЛЯ СООБЩЕСТВА");
  const deLong = heroHeadlineCqiMultiplier(12, "BLOCKCHAIN", "FÜR DIE GEMEINSCHAFT");
  assert.ok(en > ru);
  assert.ok(ru < 1.55);
  assert.ok(deLong < en);
});
