import { test, expect } from "@playwright/test";
import { importPeopleWallet, connectEmbeddedWallet } from "./live-helpers.mjs";
test("samples layout 390", async ({ browser }) => {
  for (const lang of ["en","de","zh","ar","ru"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: "ovn_lang", value: lang, url: process.env.LIVE_BASE_URL }]);
    await ctx.addInitScript((l) => { for (const k of Object.keys(localStorage)) {} ; localStorage.setItem("ovn_lang", l); }, lang);
    const p = await ctx.newPage(); await p.goto("/explorer/contracts"); await p.waitForTimeout(3000);
    await p.getByRole("button").filter({ hasText: /./ }).first();
    const ow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const t = (await p.locator("main").innerText()).replace(/\s+/g," ");
    console.log(lang, "overflow", ow, t.slice(0,220));
    await p.screenshot({ path: `/tmp/samples-390-${lang}.png`, fullPage: true }); await ctx.close();
  }
});
test("deploy erc20 via wallet", async ({ page }) => {
  await importPeopleWallet(page);
  await page.goto("/explorer/contracts"); await page.waitForTimeout(3000);
  const card = page.locator("article, li, section > div").filter({ hasText: /ERC-?20/ }).last();
  await page.getByRole("button", { name: "Deploy with my wallet" }).last().click();
  await connectEmbeddedWallet(page);
  const ins = page.locator("main input[type=text]");
  await ins.nth(0).fill("E2E Sample"); await ins.nth(1).fill("ESMP"); await ins.nth(2).fill("1000000");
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect.poll(async () => /Deployed\.|wrong/.test(await page.locator("main").innerText()), { timeout: 90000 }).toBe(true);
  await page.waitForTimeout(1000);
  console.log((await page.locator("main").innerText()).replace(/\s+/g," ").slice(-900));
  const inputs = page.locator("main input[type=text]");
  console.log("inputs", await inputs.count());
  await page.screenshot({ path: "/tmp/samples-deployform.png", fullPage: false });
});
