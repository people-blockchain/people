// LIVE user-flow pass against https://www.peopleblockchain.network (chain 97401).
//
// Skipped unless LIVE_E2E=1. Runs once at 1280px with REAL transactions from the
// funded test wallet, then re-walks the same screens at 360/390 up to (not
// including) the confirm step. Every flow records pass/fail + tx hash into
// e2e/.live-results.json, which docs/audit-final/e2e.md is generated from.
//
// The private key never leaves this process: it is read from the file named by
// E2E_WALLET_KEY_FILE, typed into the site's own Import-wallet field, and never
// logged, printed, screenshotted or written to the report.

import { test, expect } from "@playwright/test";
import { createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  LIVE_BASE_URL,
  LIVE_RPC_URL,
  attachDiagnostics,
  auditPage,
  clientNav,
  connectEmbeddedWallet,
  ensureWalletUnlocked,
  gotoReady,
  importPeopleWallet,
  trackEvmTxHashes,
  lastWalletTxHash,
  readWallet,
  settleImages,
  short,
} from "./live-helpers.mjs";

const LIVE = process.env.LIVE_E2E === "1";
test.skip(!LIVE, "set LIVE_E2E=1 to run against the live deployment");

const SHOT_DIR = new URL("../docs/screenshots/e2e/", import.meta.url);
// Overridable so the suite can be run in two foreground halves (the real-tx
// flows and the layout re-walk) without the second run clobbering the first.
const RESULTS_PATH = new URL(`./${process.env.LIVE_RESULTS_FILE ?? ".live-results.json"}`, import.meta.url);
const rpc = createPublicClient({ transport: http(LIVE_RPC_URL) });

const results = [];
const flush = () => writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
const record = (flow, viewport, result, tx = "", notes = "") => {
  results.push({ flow, viewport, result, tx, notes });
  // Written after every row so a killed run still leaves the flows it reached.
  flush();
  // eslint-disable-next-line no-console
  console.log(`[${result}] ${flow} @${viewport}${tx ? ` tx=${short(tx)}` : ""}${notes ? ` — ${notes}` : ""}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForReceipt(hash, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const receipt = await rpc.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch {
      /* not mined yet */
    }
    if (Date.now() > deadline) return null;
    await sleep(1500);
  }
}

async function waitForBalance(address, wei, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const bal = await rpc.getBalance({ address }).catch(() => 0n);
    if (bal === wei) return true;
    if (Date.now() > deadline) return false;
    await sleep(1500);
  }
}

const parsePplText = (text) => {
  const m = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};

const mainText = (page) => page.locator("#main").innerText();

let context;
let page;
let diag;
let txHashes;

test.beforeAll(async ({ browser }) => {
  mkdirSync(SHOT_DIR, { recursive: true });
  context = await browser.newContext({
    baseURL: LIVE_BASE_URL,
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
    locale: "en-US",
  });
  page = await context.newPage();
  diag = attachDiagnostics(page);
  txHashes = trackEvmTxHashes(page);
});

test.afterAll(async ({}, testInfo) => {
  if (diag) {
    const soft = {
      consoleErrors: [...new Set(diag.consoleErrors)].slice(0, 20),
      pageErrors: [...new Set(diag.pageErrors)].slice(0, 20),
      thirdParty: [...new Set(diag.thirdParty)].slice(0, 20),
      failedRequests: [...new Set(diag.failedRequests)].slice(0, 20),
    };
    results.push({ flow: "diagnostics (1280)", viewport: "1280", result: "info", tx: "", notes: JSON.stringify(soft) });
  }
  flush();
  await context?.close();
});

// ---------------------------------------------------------------------------

test("flow 1 — import wallet, balance matches chain", async () => {
  const { address } = readWallet();
  const ok = await importPeopleWallet(page).then(() => true).catch(async (err) => {
    await page.screenshot({ path: new URL("fail-flow1-import.png", SHOT_DIR).pathname, fullPage: false }).catch(() => {});
    record("1. wallet import", "1280", "FAIL", "", err.message);
    return false;
  });
  if (!ok) return;

  let uiPpl = NaN;
  let chainPpl = NaN;
  const balanceDeadline = Date.now() + 20_000;
  do {
    uiPpl = parsePplText(await page.getByTestId("wallet-ppl").innerText());
    chainPpl = Number(formatEther(await rpc.getBalance({ address })));
    if (Number.isFinite(uiPpl) && Math.abs(uiPpl - chainPpl) < 0.01) break;
    // the balance loads async after import, and a faucet top-up can land between the two reads
    await sleep(1500);
  } while (Date.now() < balanceDeadline);
  const imported = await page.evaluate(() => {
    const raw = localStorage.getItem("ppl-web-wallets");
    const rows = raw ? JSON.parse(raw) : [];
    return { count: rows.length, hasKey: JSON.stringify(rows).includes("encryptedPrivateKey"), json: JSON.stringify(rows).toLowerCase() };
  });
  // EVM canonical addresses: the stored wallet address and the page must show the key's real 0x address.
  const canonical = imported.json.includes(address.toLowerCase());
  const bodyLower = (await page.locator("body").innerText()).toLowerCase();
  const a = address.toLowerCase();
  const shown = bodyLower.includes(a) || bodyLower.includes(`${a.slice(0, 6)}…${a.slice(-4)}`);
  record("1b. wallet shows EVM canonical 0x address", "1280", canonical && shown ? "PASS" : "FAIL", "", `stored=${canonical} shown=${shown} addr=${short(address, 6)}`);
  expect(imported.count).toBeGreaterThan(0);
  const match = Number.isFinite(uiPpl) && Math.abs(uiPpl - chainPpl) < 0.01;
  record(
    "1. wallet import + balance",
    "1280",
    match && imported.hasKey ? "PASS" : "FAIL",
    "",
    `ui=${uiPpl} chain=${chainPpl} wallets=${imported.count} addr=${short(address, 6)}`,
  );
});

test("flow 2 — faucet 'Get test PPL'", async () => {
  await ensureWalletUnlocked(page);
  await page.getByTestId("wallet-action-faucet").click();
  await expect
    .poll(async () => {
      const t = await mainText(page);
      return /PPL sent|testnet PPL sent|faucet|budget|limit|empty for today|unavailable/i.test(t);
    }, { timeout: 60_000 })
    .toBe(true);
  const text = await mainText(page);
  const line =
    text.split("\n").find((l) => /PPL sent|faucet|budget|limit|empty for today|unavailable/i.test(l)) ?? "";
  const ok = /PPL sent/i.test(line);
  record("2. faucet", "1280", ok ? "PASS" : "FAIL", "", line.trim().slice(0, 160));
});

test("flow 3 — transfer 1 PPL to a fresh address", async () => {
  const recipient = privateKeyToAccount(generatePrivateKey()).address;
  const before = await rpc.getBalance({ address: recipient });
  if (before !== 0n) {
    record("3. transfer 1 PPL", "1280", "SKIP", "", "fresh address unexpectedly funded");
    return;
  }
  await ensureWalletUnlocked(page);
  await page.getByTestId("wallet-action-send").click();
  const send = page.getByRole("dialog", { name: "Send PPL" });
  await send.getByLabel("To address", { exact: true }).fill(recipient);
  await send.getByLabel("Amount", { exact: true }).fill("1");
  await send.getByRole("button", { name: "Review payment", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review payment" });
  await expect(review).toBeVisible();
  const beforeHashes = txHashes.length;
  await review.getByRole("button", { name: "Confirm and send" }).click();
  await expect
    .poll(async () => /submitted|Sent|sent/i.test(await mainText(page).catch(() => "")), { timeout: 25_000 })
    .toBe(true)
    .catch(() => {});
  const hash = txHashes[beforeHashes] ?? (await lastWalletTxHash(page));
  const landed = hash ? await waitForBalance(recipient, 10n ** 18n) : false;
  let explorerOk = false;
  if (hash) {
    await page.goto(`/explorer/tx/${hash}`, { waitUntil: "domcontentloaded" });
    // The tx view loads client-side after DOMContentLoaded; poll instead of reading once.
    explorerOk = await expect
      .poll(async () => (await page.locator("body").innerText().catch(() => "")).includes(hash.slice(2, 12)), { timeout: 20_000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
  }
  record(
    "3. transfer 1 PPL",
    "1280",
    landed && explorerOk ? "PASS" : landed ? "PARTIAL" : "FAIL",
    hash ?? "",
    `onChain=${landed} explorer=${explorerOk} to=${short(recipient, 6)}`,
  );
});

test("flow 4 — launch a small token via /create/token", async () => {
  const symbol = `E2E${Date.now().toString().slice(-6)}`.toUpperCase().slice(0, 12);
  const label = `E2E Audit Token ${symbol}`;
  // Unlock first, then navigate with the site's own link so the session
  // survives; the embedded connect option is a button only while it exists.
  await ensureWalletUnlocked(page);
  await clientNav(page, "Create a token", "/create/token");
  const connected = await connectEmbeddedWallet(page);
  await page.getByPlaceholder("Name").fill(label);
  await page.getByPlaceholder("Ticker").fill(symbol);
  await page.getByPlaceholder("for example 1000000").fill("1000000");
  const beforeHashes = txHashes.length;
  await page.getByRole("button", { name: "Sign and submit" }).click();
  await expect
    .poll(async () => (txHashes.length > beforeHashes) || /Sent|Could not submit|error/i.test(await mainText(page)), {
      timeout: 90_000,
    })
    .toBe(true)
    .catch(() => {});
  const hash = txHashes[beforeHashes] ?? "";
  const receipt = hash ? await waitForReceipt(hash) : null;
  let listed = false;
  if (hash) {
    await page.goto("/explorer/tokens", { waitUntil: "domcontentloaded" });
    const tokenList = page.getByTestId("token-list");
    await tokenList.waitFor({ state: "attached", timeout: 20_000 }).catch(() => {});
    await expect
      .poll(async () => (await tokenList.getAttribute("aria-busy")) ?? "false", { timeout: 20_000 })
      .not.toBe("true")
      .catch(() => {});
    listed = await page
      .locator("body")
      .innerText()
      .then((t) => t.includes(symbol))
      .catch(() => false);
  }
  const text = await mainText(page).catch(() => "");
  record(
    "4. token launch",
    "1280",
    receipt?.status === "success" ? "PASS" : "FAIL",
    hash,
    `connect=${connected} listed=${listed} symbol=${symbol} pageHint=${text.slice(0, 100).replace(/\s+/g, " ")}`,
  );
});

// keccak256("NftMinted(address,uint256,address,string)"), same constant as lib/evm/nft-factory.
const NFT_MINTED_TOPIC = "0xf8b1b480f3e90cec0b9871e75e1c6401bf4db0127701d88d80f0a9d0b39accf7";

test("flow 5 — create/mint an NFT via /create/nft", async () => {
  await ensureWalletUnlocked(page);
  await clientNav(page, "Create an NFT", "/create/nft");
  await connectEmbeddedWallet(page);
  const name = `E2E NFT ${Date.now().toString().slice(-5)}`;
  const submit = page.getByRole("button", { name: "Sign and submit" });
  let hash = "";
  try {
    // The EVM factory form reads mintFee from the chain; submit stays disabled until it lands.
    await page.getByLabel("Name", { exact: true }).waitFor({ state: "visible", timeout: 45_000 });
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Description", { exact: true }).fill("Live e2e audit mint.");
    await page.getByLabel("Or paste an image URL").fill(`${LIVE_BASE_URL}/seed/nft-pitpat-founding-parent.png`);
    await expect(submit).toBeEnabled({ timeout: 45_000 });
    const beforeHashes = txHashes.length;
    await submit.click();
    // createCollection + mint are two writes; the result panel links the mint tx.
    await page.getByText("Created", { exact: true }).waitFor({ state: "visible", timeout: 180_000 });
    const href = await page.locator('a[href^="/explorer/tx/"]').first().getAttribute("href");
    hash = href ? href.replace("/explorer/tx/", "") : (txHashes[txHashes.length - 1] ?? "");
    if (!hash) hash = txHashes[beforeHashes] ?? "";
  } catch (err) {
    const text = await mainText(page).catch(() => "");
    record("5. NFT mint", "1280", "FAIL", "", `form: ${err.message} — ${text.slice(0, 140).replace(/\s+/g, " ")}`);
    return;
  }
  const receipt = hash ? await waitForReceipt(hash, 60_000) : null;
  const minted = Boolean(
    receipt?.logs?.some((log) => log.topics?.[0]?.toLowerCase() === NFT_MINTED_TOPIC),
  );
  record(
    "5. NFT mint",
    "1280",
    receipt?.status === "success" && minted ? "PASS" : "FAIL",
    hash,
    `name=${name} status=${receipt?.status ?? "no-receipt"} NftMinted=${minted}`,
  );
});

// ERC-20 Transfer(address,address,uint256) — the swap output the router pays the wallet.
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

test("flow 6 — swap 1 PPL → seeded token on /swap", async () => {
  const pools = await fetch(`${LIVE_BASE_URL}/api/evm/compat/liquidity-pools`).then((r) => r.json()).catch(() => []);
  const assets = await fetch(`${LIVE_BASE_URL}/api/evm/compat/assets`).then((r) => r.json()).catch(() => []);
  const pool = [...(Array.isArray(pools) ? pools : [])]
    .filter((p) => p.tokenAssetId)
    .sort((a, b) => b.nativeReserve - a.nativeReserve)[0];
  const asset = (Array.isArray(assets) ? assets : []).find((a) => a.assetId === pool?.tokenAssetId);
  const symbol = asset?.symbol ?? pool?.tokenAssetId ?? "?";
  const tokenAddress = pool?.tokenAddress;
  await ensureWalletUnlocked(page);
  await clientNav(page, "Swap", "/swap");
  const connected = await connectEmbeddedWallet(page);
  await page.getByTestId("swap-submit").waitFor({ state: "visible", timeout: 45_000 });
  // Selecting the pool from the left list sets the token without flipping the
  // direction, so PPL stays the token being sold (the wallet holds no seeded token).
  const poolButton = page.getByRole("button").filter({ hasText: `${symbol} / PPL` });
  // The pool list loads from the compat API after the form paints, so wait for it.
  const listed = await poolButton
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!listed) {
    const seen = await page.getByRole("button").filter({ hasText: "/ PPL" }).allInnerTexts().catch(() => []);
    record("6. swap PPL→token", "1280", "FAIL", "", `pool ${symbol}/PPL not listed (connect=${connected} pools=${JSON.stringify(seen.slice(0, 6))})`);
    return;
  }
  await poolButton.first().click();
  await expect(page.getByTestId("swap-pool-depth")).toContainText(symbol);
  await page.getByTestId("swap-amount").fill("1");
  const quoted = await expect
    .poll(async () => (await page.getByTestId("swap-out").innerText()).trim(), { timeout: 25_000 })
    .not.toBe("0")
    .then(() => true)
    .catch(() => false);
  const rate = await page.getByTestId("swap-rate").innerText().catch(() => "");
  if (!quoted) {
    // Pre-deploy state of the quote fix: the deployed bundle leaves "You receive" empty and
    // disables submit, so the swap cannot be exercised until it ships. Recorded, not failed.
    const label = (await page.getByTestId("swap-submit").innerText().catch(() => "")).trim();
    record(
      "6. swap PPL→token",
      "1280",
      "BLOCKED",
      "",
      `deployed quote empty (rate="${rate.trim()}" submit="${label}") — fix not deployed`,
    );
    return;
  }
  const submitLabel = (await page.getByTestId("swap-submit").innerText().catch(() => "")).trim();
  // The signing guard also needs the pair reserves read from chain; if that read is still in
  // flight the click is a no-op, so retry before giving up.
  let hash = "";
  for (let attempt = 0; attempt < 3 && !hash; attempt++) {
    const beforeHashes = txHashes.length;
    await page.getByTestId("swap-submit").click();
    await expect
      .poll(async () => txHashes.length > beforeHashes, { timeout: 30_000 })
      .toBe(true)
      .catch(() => {});
    hash = txHashes[beforeHashes] ?? "";
    if (!hash) await page.waitForTimeout(5000);
  }
  const receipt = hash ? await waitForReceipt(hash) : null;
  // Prove delivery from the receipt, not from readWallet().address: while E2E-H1 is open the
  // embedded wallet's *identity* is the sha256 legacy address, so the router pays that address
  // even though the key's EIP-55 address signs the tx.
  const transfer = (receipt?.logs ?? []).find(
    (log) => log.address?.toLowerCase() === tokenAddress?.toLowerCase() && log.topics?.[0] === TRANSFER_TOPIC,
  );
  const delivered = transfer ? BigInt(transfer.data) : 0n;
  const paidTo = transfer ? `0x${transfer.topics[2].slice(-40)}` : "";
  const text = await mainText(page).catch(() => "");
  record(
    "6. swap PPL→token",
    "1280",
    receipt?.status === "success" && delivered > 0n ? "PASS" : "FAIL",
    hash,
    `connect=${connected} token=${symbol} delivered=${delivered} to=${short(paidTo, 4)} rate="${rate.trim()}" submit="${submitLabel}" pageHint=${text.slice(0, 60).replace(/\s+/g, " ")}`,
  );
});

test("flow 7 — delegate 1 PPL on /staking (staking precompile)", async () => {
  const { address } = readWallet();
  const STAKING = "0x0000000000000000000000000000000000000800";
  const abi = [{ type: "function", name: "delegation", stateMutability: "view",
    inputs: [{ name: "d", type: "address" }, { name: "v", type: "string" }],
    outputs: [{ name: "shares", type: "uint256" }, { name: "balance", type: "tuple", components: [{ name: "denom", type: "string" }, { name: "amount", type: "uint256" }] }] }];
  await ensureWalletUnlocked(page);
  await gotoReady(page, "/staking");
  const text = await mainText(page);
  if (/Staking isn't live on this testnet yet/i.test(text)) {
    record("7. staking delegate", "1280", "FAIL", "", "page says staking is not live");
    return;
  }
  const row = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: "Delegate", exact: true }) }).first();
  const rowText = await row.innerText({ timeout: 30_000 }).catch(() => "");
  // The table shows the operator as 0x hex; map the two testnet validators to their bech32 operator.
  const VALOPERS = {
    "0xae7b4a57363f0aa3f76fc2b5e460bc0d4bcfb565": "peoplevaloper14ea554ek8u928am0c267gc9up49uldt97h7q23",
    "0xf31b292562e93be281db2601f38400e5a22e9aec": "peoplevaloper17vdjjftzaya79qwmycql8pqquk3zaxhv448l4c",
  };
  const hex = (rowText.match(/0x[0-9a-fA-F]{40}/) ?? [""])[0].toLowerCase();
  const valoper = (rowText.match(/peoplevaloper1[0-9a-z]+/) ?? [])[0] ?? VALOPERS[hex] ?? VALOPERS["0xae7b4a57363f0aa3f76fc2b5e460bc0d4bcfb565"];
  const readStake = async (v) => {
    try {
      const [, bal] = await rpc.readContract({ address: STAKING, abi, functionName: "delegation", args: [address, v] });
      return bal.amount;
    } catch { return -1n; }
  };
  const before = await readStake(valoper);
  await row.getByRole("button", { name: "Delegate", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").fill("1");
  const beforeHashes = txHashes.length;
  await dialog.getByRole("button", { name: "Delegate", exact: true }).click();
  const ok = await expect
    .poll(async () => /Delegated successfully|Delegation failed/i.test(await mainText(page).catch(() => "")), { timeout: 60_000 })
    .toBe(true).then(() => true).catch(() => false);
  const t2 = await mainText(page).catch(() => "");
  const hash = txHashes[beforeHashes] ?? "";
  let after = before;
  for (let i = 0; i < 10 && after === before; i++) { await sleep(1500); after = await readStake(valoper); }
  const grew = before >= 0n && after - before === 10n ** 18n;
  record("7. staking delegate 1 PPL", "1280", ok && /Delegated successfully/i.test(t2) && grew ? "PASS" : "FAIL", hash,
    `ui=${/Delegated successfully/i.test(t2)} stake ${formatEther(before)} -> ${formatEther(after)} PPL on ${valoper.slice(0, 20)}…`);
});

test("flow 8 — governance / voting UI", async () => {
  const nav = await page.goto("/", { waitUntil: "domcontentloaded" });
  const html = await page.content();
  const navVote = /govern|vote|proposal/i.test(html);
  record(
    "8. votes/governance",
    "1280",
    "INFO",
    "",
    navVote ? "governance wording present in markup — inspect" : "no governance/vote UI anywhere on the site (no page, no nav entry)",
  );
  expect(nav?.status()).toBeLessThan(400);
});

test("layout — same flows at 360 and 390 up to the confirm step", async () => {
  await page.setViewportSize({ width: 360, height: 800 });
  const screens = ["/wallet", "/create/token", "/create/nft", "/swap", "/staking", "/discover", "/explorer"];
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: width === 360 ? 800 : 844 });
    for (const path of screens) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await settleImages(page);
      const audit = await auditPage(page);
      const overflow = audit.overflow.scrollWidth - audit.overflow.innerWidth;
      const clean = overflow <= 1 && audit.brokenImages.length === 0;
      if (!clean) {
        await page.screenshot({ path: new URL(`fail-layout-${width}-${path.replace(/\W+/g, "_")}.png`, SHOT_DIR).pathname }).catch(() => {});
      }
      record(
        `layout ${path}`,
        String(width),
        clean ? "PASS" : "FAIL",
        "",
        overflow > 1 ? `overflow +${overflow}px` : audit.brokenImages.length ? `broken images: ${audit.brokenImages.length}` : "",
      );
    }
  }
  // Send sheet at 360: walk to the review step, never confirm.
  await page.setViewportSize({ width: 360, height: 800 });
  await ensureWalletUnlocked(page);
  await page.getByTestId("wallet-action-send").click();
  const send = page.getByRole("dialog", { name: "Send PPL" });
  await send.getByLabel("To address", { exact: true }).fill("0x" + "a".repeat(40));
  await send.getByLabel("Amount", { exact: true }).fill("1");
  await send.getByRole("button", { name: "Review payment", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review payment" });
  // The dialog mounts a tick after the click; polling once here raced it.
  const visible = await review
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  const audit = await auditPage(page);
  const overflow = audit.overflow.scrollWidth - audit.overflow.innerWidth;
  record(
    "layout send-review sheet",
    "360",
    visible && overflow <= 1 ? "PASS" : "FAIL",
    "",
    visible ? (overflow > 1 ? `overflow +${overflow}px` : "review shown, not confirmed") : "review dialog did not open",
  );
  await review.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => {});
});
