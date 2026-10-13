import { test, expect } from "@playwright/test";
import { importPeopleWallet } from "./live-helpers.mjs";
import { writeFileSync } from "node:fs";
test.skip(process.env.LIVE_E2E !== "1", "set LIVE_E2E=1 to run against the live deployment");
const REST = "https://node.peopleblockchain.network/rest/cosmos/gov/v1/proposals/1/votes/people15e99t3mcaxqtcmhv68rtz3t33lszgl2nt76nyw";
const getVote = async () => { const r = await fetch(REST); if (!r.ok) return null; const j = await r.json(); return j.vote?.options?.[0]?.option ?? null; };
test("flow 8 — vote via /governance UI", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ baseURL: "https://www.peopleblockchain.network", viewport: { width: 1280, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  const before = await getVote();
  await importPeopleWallet(page);
  await page.goto("/governance", { waitUntil: "domcontentloaded" });
  await page.getByText("Testnet governance check").first().waitFor({ timeout: 45_000 }); await page.screenshot({ path: "docs/screenshots/e2e/live-gov-list.png" });
  await page.getByText("Testnet governance check").first().click();
  await page.getByRole("button", { name: "Abstain" }).first().waitFor({ timeout: 30_000 });
  await page.screenshot({ path: "docs/screenshots/e2e/live-gov-detail.png", fullPage: true });
  const target = before === "VOTE_OPTION_ABSTAIN" ? ["Vote Yes", "VOTE_OPTION_YES"] : ["Abstain", "VOTE_OPTION_ABSTAIN"];
  await page.getByRole("button", { name: target[0], exact: true }).first().click();
  await page.getByRole("button", { name: "Confirm vote" }).click();
  await page.getByText(/Vote submitted|Vote failed|View transaction/).first().waitFor({ timeout: 90_000 }).catch(() => {});
  const ui = (await page.locator("#main").innerText()).match(/Vote submitted[^\n]*|Vote failed[^\n]*/)?.[0];
  let after = null; for (let i = 0; i < 30 && after !== target[1]; i++) { after = await getVote(); await new Promise((r) => setTimeout(r, 2000)); }
  await page.screenshot({ path: "docs/screenshots/e2e/live-gov-voted.png", fullPage: true });
  writeFileSync("e2e/.vote-result.json", JSON.stringify({ before, target: target[1], after, ui, errs }, null, 1));
  expect(after).toBe(target[1]);
  await ctx.close();
});
