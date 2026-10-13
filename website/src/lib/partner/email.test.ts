import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMagicLinkEmail, resolveMagicLinkLocale } from "./email.ts";

test("magic-link email is People-branded and contains the sign-in URL", () => {
  const mail = renderMagicLinkEmail({
    url: "https://www.peopleblockchain.network/api/auth/callback/resend?token=demo",
    host: "www.peopleblockchain.network",
    locale: "en",
  });
  assert.match(mail.subject, /People Partner Portal/);
  assert.match(mail.html, /Partner Portal sign-in/);
  assert.match(mail.html, /https:\/\/www\.peopleblockchain\.network\/brand\/icon-192\.png/);
  assert.match(mail.html, /https:\/\/www\.peopleblockchain\.network\/api\/auth\/callback\/resend\?token=demo/);
  assert.doesNotMatch(mail.html, /\bVLS\b/);
  assert.doesNotMatch(mail.text, /\bVLS\b/);
});

test("magic-link email uses Russian copy when locale is ru", () => {
  const mail = renderMagicLinkEmail({
    url: "https://www.peopleblockchain.network/api/auth/callback/resend?token=demo",
    host: "www.peopleblockchain.network",
    locale: "ru",
  });
  assert.match(mail.subject, /кабинет партнёра/i);
  assert.match(mail.html, /Войти/);
});

test("resolveMagicLinkLocale reads Accept-Language", () => {
  assert.equal(resolveMagicLinkLocale("ru-RU,ru;q=0.9,en;q=0.8"), "ru");
  assert.equal(resolveMagicLinkLocale("de-DE,en;q=0.5"), "de");
  assert.equal(resolveMagicLinkLocale(null), "en");
});
