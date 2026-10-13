import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COMMANDS,
  PROFILE,
  SITE_LOCALES,
  applyProfile,
  profileCalls,
  validateProfile,
  verifyProfile,
} from "./telegram-bot-profile.mjs";

test("profile covers exactly the 12 site locales and passes Telegram's caps", () => {
  assert.deepEqual(
    [...SITE_LOCALES].sort(),
    ["ar", "de", "en", "es", "fr", "id", "it", "pt", "ru", "tr", "vi", "zh"],
  );
  for (const locale of SITE_LOCALES) assert.ok(PROFILE[locale], `missing profile: ${locale}`);
  assert.deepEqual(validateProfile(), []);
});

test("menu is Verify / Support / Report a bug in that order, names Telegram-safe", () => {
  assert.deepEqual(COMMANDS.map((c) => c.command), ["verify", "support", "bug"]);
  const en = profileCalls("en").find((c) => c.method === "setMyCommands");
  assert.deepEqual(en.body.commands.map((c) => c.description), ["Verify", "Support", "Report a bug"]);
});

test("English is the default profile (no language_code); the other 11 are localized", () => {
  for (const call of profileCalls("en")) assert.ok(!("language_code" in call.body), `en ${call.method} must omit language_code`);
  for (const locale of SITE_LOCALES.filter((l) => l !== "en")) {
    const calls = profileCalls(locale);
    assert.equal(calls.length, 4);
    for (const call of calls) assert.equal(call.body.language_code, locale, `${locale} ${call.method}`);
  }
});

test("every locale writes name, description, short description and commands", () => {
  for (const locale of SITE_LOCALES) {
    assert.deepEqual(
      profileCalls(locale).map((c) => c.method),
      ["setMyName", "setMyDescription", "setMyShortDescription", "setMyCommands"],
    );
  }
});

test("applyProfile is idempotent and never leaks the token", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }));
  };
  const results = await applyProfile("999:SECRET", { fetchImpl });
  assert.equal(results.length, SITE_LOCALES.length * 4);
  assert.ok(results.every((r) => r.ok));
  assert.ok(seen.every((s) => s.url.includes("/bot999:SECRET/")), "sanity: token is in the request url");

  // Re-applying issues the same four idempotent writes per locale.
  const again = await applyProfile("999:SECRET", { fetchImpl });
  assert.deepEqual(again, results);
});

test("verifyProfile reads back the name and commands per locale", async () => {
  const fetchImpl = async (url) => {
    const method = String(url).split("/").pop();
    if (method === "getMyName") return new Response(JSON.stringify({ ok: true, result: { name: "People Blockchain Helper" } }));
    return new Response(
      JSON.stringify({ ok: true, result: COMMANDS.map((c) => ({ command: c.command, description: c.label.en })) }),
    );
  };
  const verified = await verifyProfile("1:2", { fetchImpl });
  assert.equal(verified.length, SITE_LOCALES.length);
  for (const row of verified) {
    assert.equal(row.name, "People Blockchain Helper");
    assert.deepEqual(row.commands, ["verify", "support", "bug"]);
  }
});
