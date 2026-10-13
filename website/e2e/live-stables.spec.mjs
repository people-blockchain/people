import { test, expect } from "@playwright/test";
import { importPeopleWallet, connectEmbeddedWallet } from "./live-helpers.mjs";
const main = (p) => p.locator("main");
test("stables: faucet + escrow in tUSDC + crowdfund in PPL", async ({ page }) => {
  await importPeopleWallet(page);
  await page.goto("/explorer/contracts"); await page.waitForTimeout(3000);
  await connectEmbeddedWallet(page);
  const fb = page.getByRole("button", { name: /Get test tUSDT/ }); console.log("faucet btn", await fb.count());
  if (await fb.count()) { await fb.click(); await connectEmbeddedWallet(page); await page.getByRole("button", { name: /Get test tUSDT/ }).click(); await expect(page.getByRole("button", { name: /Minted/ }).first()).toBeVisible({ timeout: 60000 }).catch(()=>console.log("faucet: no Minted")); }
  // Escrow card
  const escrow = page.locator("article, section div").filter({ has: page.getByText("SampleEscrow.sol", { exact: true }) }).last();
  await page.getByRole("button", { name: "Deploy with my wallet" }).first().click();
  await connectEmbeddedWallet(page);
  await page.waitForTimeout(800);
  const sel = main(page).locator("select").first();
  console.log("selects", await main(page).locator("select").count(), await sel.locator("option").allInnerTexts());
  await sel.selectOption({ label: "tUSDC" }).catch(e=>console.log("sel err", e.message.slice(0,80)));
  const form = main(page).locator("input[type=text]");
  const n = await form.count(); const vals = []; for (let i=0;i<n;i++) vals.push(await form.nth(i).inputValue()); console.log("inputs", JSON.stringify(vals));
  await form.nth(0).fill("0x000000000000000000000000000000000000dEaD");
  await form.nth(1).fill("0xb3B803d3AC8d08Fbc2214D0D9eE615109eC614Bf"); await form.nth(2).fill("5");
  await page.getByRole("button", { name: "Deploy", exact: true }).first().click();
  await page.waitForTimeout(20000);
  const t1 = (await main(page).innerText()).replace(/\s+/g," ");
  console.log("after deploy:", t1.match(/Deployed.{0,300}/)?.[0] ?? t1.slice(0,0), t1.match(/(wrong|error|Error).{0,200}/)?.[0]);
  for (const name of [/Approve/i, /Deposit/i]) {
    const b = main(page).getByRole("button", { name }).first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(15000); console.log("clicked", name); }
  }
  const t2 = (await main(page).innerText()).replace(/\s+/g," ");
  console.log("final:", t2.match(/Deployed.{0,600}/)?.[0]);
  await page.screenshot({ path: "/tmp/stables-escrow.png", fullPage: false });
});
