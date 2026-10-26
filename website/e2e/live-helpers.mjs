// Shared helpers for the LIVE end-to-end pass (people_97401-1 / EVM 97401).
//
// Everything in website/e2e/ is skipped unless LIVE_E2E=1 is set: these specs
// drive the real deployment at https://www.peopleblockchain.network and the
// 1280px flows broadcast real transactions from the funded test wallet.
//
// The wallet private key is read from the file named by E2E_WALLET_KEY_FILE and
// is never printed, logged, attached to a report or written into a screenshot.

import { readFileSync } from "node:fs";

export const LIVE_BASE_URL = process.env.LIVE_BASE_URL ?? "https://www.peopleblockchain.network";
export const LIVE_RPC_URL = process.env.LIVE_RPC_URL ?? "https://node.peopleblockchain.network/rpc";
export const LIVE_CHAIN_ID = 97401;
export const WALLET_PASSWORD = "e2e-live-pass-1";

export const VIEWPORTS = [
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
];

/** Third-party hosts whose console noise is not a website bug. */
const THIRD_PARTY = [
  /walletconnect/i,
  /web3auth/i,
  /google|gstatic|googleapis|accounts\./i,
  /vercel\.live|vercel\.com/i,
  /worldcoin|idkit/i,
  /metamask|trustwallet|coinbase|inpage/i,
  /turnstile|cloudflare/i,
  /favicon/i,
  /^Failed to load resource: net::ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|BLOCKED_BY_CLIENT|CONNECTION_REFUSED)/i,
];

export function isThirdPartyNoise(text) {
  return THIRD_PARTY.some((re) => re.test(text));
}

/** Reads the funded e2e wallet. Never returns anything derived that is logged. */
export function readWallet() {
  const path = process.env.E2E_WALLET_KEY_FILE;
  if (!path) throw new Error("E2E_WALLET_KEY_FILE is not set");
  const raw = readFileSync(path, "utf8").trim();
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("wallet key file is not a 32-byte hex key");
  const address = readFileSync(`${path.replace(/\.key$/, "")}.address`, "utf8").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("wallet address file is not an address");
  return { privateKey: `0x${hex}`, address };
}

/**
 * Collects browser diagnostics for one page. `consoleErrors` merges page errors
 * and console.error output; `thirdParty` keeps the noise that we do not fail on
 * but still report separately.
 */
export function attachDiagnostics(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const thirdParty = [];
  const failedRequests = [];
  const thirdPartyRequests = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const loc = msg.location?.();
    const text = `${msg.text()}${loc?.url ? ` @ ${loc.url}` : ""}`;
    (isThirdPartyNoise(text) ? thirdParty : consoleErrors).push(text);
  });
  page.on("pageerror", (err) => {
    const text = err?.message ?? String(err);
    (isThirdPartyNoise(text) ? thirdParty : pageErrors).push(text);
  });
  page.on("requestfailed", (req) => {
    const text = `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "failed"}`;
    (isThirdPartyNoise(req.url()) ? thirdPartyRequests : failedRequests).push(text);
  });
  return { consoleErrors, pageErrors, thirdParty, failedRequests, thirdPartyRequests };
}

/** Waits for every <img> on the page to finish loading (or gives up quietly). */
export async function settleImages(page, timeout = 8000) {
  await page.waitForLoadState("load").catch(() => {});
  await page
    .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout })
    .catch(() => {});
}

/** In-page layout / content audit: overflow, broken images, untranslated keys. */
export async function auditPage(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const TLD =
      /\.(com|net|org|io|ru|dev|app|xyz|eth|network|finance|ai|co|me|so|gg|live|page|site|link|online|store|tech|uk|de|fr|es|it|tr|vn|id|cn|br|in|jp|kr|nl|pl|pt|se|ch|at|be|ca|au|nz|za|info|biz|name|pro|tel|mobi|asia|cat|coop|aero|jobs|travel|json|js|css|png|svg|webp)$/i;
    const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "NOSCRIPT", "TEXTAREA"]);
    const keyLike = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || SKIP.has(parent.tagName)) continue;
      if (parent.closest("[class*='font-mono']")) continue;
      const text = (node.textContent ?? "").trim();
      if (!text || text.length > 60) continue;
      // `(?<![.\w/@-])` keeps filenames like `.env.node` and paths out of the
      // "missing translation key" set, which only ever starts a fresh token.
      for (const m of text.matchAll(/(?<![.\w/@-])[a-z][A-Za-z0-9]*(?:\.[a-zA-Z][A-Za-z0-9]*)+\b/g)) {
        const token = m[0];
        if (TLD.test(token) || token.startsWith("www.") || /^0x/.test(token)) continue;
        if (/\d/.test(token.split(".").pop())) continue;
        keyLike.add(token);
      }
      for (const m of text.matchAll(/\{\{[^}]*\}\}/g)) keyLike.add(m[0]);
    }
    // Only a *finished* image with naturalWidth 0 is really broken; a still
    // loading one reports 0 too and produced false positives.
    const images = [...document.images]
      .filter((img) => img.currentSrc || img.src)
      .map((img) => {
        const rect = img.getBoundingClientRect();
        return {
          src: img.currentSrc || img.src,
          naturalWidth: img.naturalWidth,
          alt: img.alt,
          complete: img.complete,
          visible: rect.width > 0 && rect.height > 0,
        };
      })
      .filter((img) => img.visible && img.complete && img.naturalWidth === 0);
    const emptyStates = [];
    const bodyText = (document.body.innerText || "").toLowerCase();
    for (const phrase of [
      "not configured",
      "contracts not deployed",
      "coming soon",
      "failed to load",
      "something went wrong",
      "no data available",
      "unavailable",
      "не настроен",
    ]) {
      if (bodyText.includes(phrase)) emptyStates.push(phrase);
    }
    return {
      overflow: {
        scrollWidth: doc.scrollWidth,
        innerWidth: window.innerWidth,
        clientWidth: doc.clientWidth,
      },
      brokenImages: images,
      untranslatedKeys: [...keyLike],
      emptyStates,
      title: document.title,
      lang: doc.lang,
      theme: doc.getAttribute("data-theme"),
    };
  });
}

/**
 * Opens /wallet and waits until the app is hydrated enough to take a click.
 *
 * Clicking a wallet button before hydration completes is a trap: React then
 * finishes hydrating, the router does a full navigation back to /wallet, the
 * sheet you just opened is torn down, and the next `fill` retries against an
 * element that never comes back (it hangs until the test timeout).
 */
export async function openWallet(page) {
  await page.goto("/wallet", { waitUntil: "load" });
  await page.locator("#main").waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(1200);
}

/**
 * Navigates and gives the client bundle a moment to hydrate before the caller
 * clicks anything (see `openWallet` for what goes wrong otherwise).
 */
export async function gotoReady(page, path) {
  await page.goto(path, { waitUntil: "load" });
  await page.locator("#main").waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(1200);
}

/**
 * Navigates through the site's own <Link>s instead of `page.goto`.
 *
 * The unlocked wallet lives in React state, so a full reload drops it — and
 * with no session `ConnectWalletMenu` renders a *link* back to /wallet rather
 * than the button that calls `connectEmbedded()`. A real user clicking through
 * the nav keeps the session; a script that reloads at every step does not.
 * Falls back to a hard navigation when the link is not on this page.
 */
export async function clientNav(page, linkName, fallbackPath) {
  for (const link of [
    page.locator(`a[href="${fallbackPath}"]`).first(),
    page.getByRole("link", { name: linkName, exact: true }).first(),
  ]) {
    try {
      if (await link.count()) {
        await link.scrollIntoViewIfNeeded().catch(() => {});
        await link.click({ timeout: 15_000 });
        await page.waitForTimeout(1500);
        return true;
      }
    } catch {
      /* try the next locator, then fall back to a hard navigation */
    }
  }
  await gotoReady(page, fallbackPath);
  return false;
}

/**
 * Connects the embedded PEOPLE Wallet on a page that offers it: a button when
 * an unlocked session exists, a link to /wallet when it does not.
 */
export async function connectEmbeddedWallet(page) {
  const button = page.getByRole("button", { name: "PEOPLE Wallet (this browser)" });
  if (await button.count()) {
    await button.first().click();
    await page.waitForTimeout(2000);
    return "button";
  }
  return "absent";
}

/** Clicks `trigger` and waits for `sheet` to survive the hydration navigation. */
async function openSheet(page, trigger, sheet) {
  await trigger.waitFor({ state: "visible", timeout: 45_000 });
  for (let attempt = 0; attempt < 4; attempt++) {
    await trigger.click();
    try {
      await sheet.waitFor({ state: "visible", timeout: 6_000 });
      return;
    } catch {
      // The hydration reload closed it again; let the page settle and retry.
      await page.waitForLoadState("load").catch(() => {});
      await page.waitForTimeout(800);
    }
  }
  throw new Error("wallet sheet did not stay open");
}

/**
 * Drives the site's own PEOPLE Wallet onboarding ("Import wallet"): a 64-char
 * hex key plus a local password. Nothing about the key is ever emitted.
 */
export async function importPeopleWallet(page) {
  const { privateKey, address } = readWallet();
  const main = page.locator("#main");
  await openWallet(page);
  const trigger = main.getByRole("button", { name: "Import wallet", exact: true }).first();
  const area = main.locator("textarea").first();
  await openSheet(page, trigger, area);
  await area.fill(privateKey);
  await main.locator("input[type='password']").first().fill(WALLET_PASSWORD);
  await main.getByRole("button", { name: "Import wallet", exact: true }).last().click();
  await page.getByTestId("wallet-ppl").waitFor({ state: "visible", timeout: 60_000 });
  return address;
}

/**
 * Unlocks an already-stored PEOPLE Wallet (same browser context only). A
 * reloaded /wallet shows the onboarding screen with an "Unlock" entry instead
 * of the wallet itself, so every flow after the first has to go through here.
 */
export async function unlockPeopleWallet(page, { navigate = true } = {}) {
  const main = page.locator("#main");
  if (navigate) await openWallet(page);
  const trigger = main.getByRole("button", { name: "Unlock", exact: true }).first();
  const password = main.locator("input[type='password']").first();
  await openSheet(page, trigger, password);
  await password.fill(WALLET_PASSWORD);
  await main.getByRole("button", { name: "Unlock", exact: true }).last().click();
  await page.getByTestId("wallet-ppl").waitFor({ state: "visible", timeout: 60_000 });
}

/**
 * Opens /wallet and guarantees an unlocked wallet, however the context starts:
 * already unlocked, locked with a stored vault, or with no vault at all (a
 * subset run, e.g. only the swap flow, has to import the key itself).
 */
export async function ensureWalletUnlocked(page) {
  await openWallet(page);
  if (await page.getByTestId("wallet-ppl").isVisible().catch(() => false)) return;
  const hasVault = await page.evaluate(() => Boolean(localStorage.getItem("ppl-web-wallets")));
  if (hasVault) {
    const unlock = page.locator("#main").getByRole("button", { name: "Unlock", exact: true }).first();
    if (await unlock.count()) {
      await unlockPeopleWallet(page, { navigate: false });
      return;
    }
  }
  await importPeopleWallet(page);
}

/**
 * Records every raw EVM transaction hash the page pushes through the
 * same-origin `/api/evm/rpc` proxy (all embedded-wallet writes use it).
 */
export function trackEvmTxHashes(page) {
  const hashes = [];
  page.on("response", async (res) => {
    if (!res.url().includes("/api/evm/rpc")) return;
    const req = res.request();
    let body;
    try {
      body = req.postDataJSON();
    } catch {
      return;
    }
    const items = Array.isArray(body) ? body : [body];
    if (!items.some((it) => it?.method === "eth_sendRawTransaction")) return;
    try {
      const json = await res.json();
      const rows = Array.isArray(json) ? json : [json];
      for (const row of rows) {
        if (typeof row?.result === "string" && /^0x[0-9a-fA-F]{64}$/.test(row.result)) {
          hashes.push(row.result);
        }
      }
    } catch {
      /* transport error — the flow assertion surfaces it */
    }
  });
  return hashes;
}

/** Finds the newest outgoing tx hash the wallet recorded in localStorage. */
export async function lastWalletTxHash(page) {
  return page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("people-wallet-activity:"));
    const rows = keys.flatMap((k) => {
      try {
        return JSON.parse(localStorage.getItem(k) ?? "[]");
      } catch {
        return [];
      }
    });
    rows.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    return rows[0]?.id ?? null;
  });
}

export const short = (s, n = 10) =>
  typeof s === "string" && s.length > n * 2 + 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
