import { test, expect } from "@playwright/test";
import { ensureWalletUnlocked, connectEmbeddedWallet, importPeopleWallet } from "./live-helpers.mjs";
test("token launch paid in tUSDC", async ({ page }) => {
  const hashes = []; page.on("response", async (r) => { try { const b = r.request().postData() || ""; if (b.includes("eth_sendRawTransaction")) { const j = await r.json(); if (j.result) hashes.push(j.result); } } catch {} });
  await importPeopleWallet(page);
  await page.goto("/create/token"); await page.waitForTimeout(4000);
  await connectEmbeddedWallet(page);
  const sym = `SF${Date.now().toString().slice(-6)}`;
  await page.getByPlaceholder("Name").fill(`Stable Fee ${sym}`);
  await page.getByPlaceholder("Ticker").fill(sym);
  await page.getByPlaceholder("for example 1000000").fill("1000000");
  await page.getByTestId("stable-fee-option").getByRole("button", { name: "tUSDC" }).click();
  await page.waitForTimeout(3000);
  console.log("FEEUI", (await page.getByTestId("stable-fee-option").innerText()).replace(/\s+/g, " "));
  await page.getByRole("button", { name: "Sign and submit" }).click();
  await expect.poll(async () => /Sent: 0x|Could not submit/i.test(await page.locator("main").innerText()), { timeout: 150000 }).toBe(true);
  console.log("RESULT", (await page.locator("main").innerText()).match(/(Sent: 0x|Could not submit)[\s\S]{0,120}/)?.[0].replace(/\s+/g," "));
  console.log("HASHES", JSON.stringify(hashes), "SYM", sym);
});
