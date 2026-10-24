// Browser flow for /create/nft with a scripted wallet and mocked storage: no live RPC, no live
// storage. Checks the order of calls (files stored before any signature), previews, the player
// attributes, errors with retry and that a mint is never sent twice.
import { test, expect } from "@playwright/test";
import {
  COLLECTION,
  DIR_CID,
  META_CID,
  VIDEO_CID,
  fixture,
  holdReceipts,
  installNftMocks,
  mintSends,
} from "./nft-media-mocks.mjs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || process.env.SHOT_BASE_URL || "http://localhost:3111";

async function open(page, options) {
  const world = await installNftMocks(page, options);
  await page.goto(`${BASE}/create/nft`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("nft-mint")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/2\.925/)).toBeVisible({ timeout: 15_000 });
  return world;
}

const file = (name, mimeType, buffer) => ({ name, mimeType, buffer });
const pickImage = (page, name, mimeType, buffer) => page.getByTestId("nft-image-input").setInputFiles(file(name, mimeType, buffer));

test.use({ viewport: { width: 390, height: 844 } });

test("PNG: files are stored before the wallet is asked, then the NFT shows a PeopleScan link", async ({ page }) => {
  const world = await open(page);
  await pickImage(page, "art.png", "image/png", fixture("image.png"));
  await page.getByLabel(/^Name/).fill("Green square");
  await expect(page.getByTestId("nft-mint")).toBeDisabled();
  await expect(page.getByTestId("nft-preview-image")).toHaveAttribute("src", /^blob:/);

  await page.getByTestId("nft-save").click();
  await expect(page.getByTestId("nft-files-saved")).toBeVisible();
  await expect(page.getByTestId("nft-mint")).toBeEnabled();
  expect(world.sent).toHaveLength(0);
  // The preview now shows the stored copy.
  await expect(page.getByTestId("nft-preview-image")).toHaveAttribute("src", new RegExp(`^https://gateway.pinata.cloud/ipfs/${DIR_CID}/image.png`));

  await page.getByTestId("nft-mint").click();
  const link = page.getByTestId("nft-peoplescan-link");
  await expect(link).toBeVisible({ timeout: 20_000 });
  await expect(link).toHaveAttribute("href", `https://peoplescan.org/nft/${COLLECTION}/0`);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);

  // Order: image, metadata, and only then the transactions.
  const order = world.api;
  expect(order.indexOf("POST image")).toBeLessThan(order.indexOf("POST metadata"));
  expect(order.indexOf("POST metadata")).toBeLessThan(order.findIndex((entry) => entry.startsWith("WALLET")));
  expect(world.sent.map((entry) => entry.fn)).toEqual(["createCollection", "mint"]);
  // The mint carries the metadata address and the fee read from the contract.
  const mint = world.sent[1];
  expect(mint.args[1]).toBe(`ipfs://${META_CID}/metadata.json`);
  expect(BigInt(mint.value)).toBe(2_925_000_000_000_000_000n);
  expect(world.metadataBodies[0].image).toBe(`ipfs://${DIR_CID}/image.png`);
  expect(world.metadataBodies[0].animationUrl).toBeUndefined();
});

test("SVG: the preview is an <img> of the sanitized copy and no SVG with a script reaches the DOM", async ({ page }) => {
  const world = await open(page);
  await pickImage(page, "mal.svg", "image/svg+xml", fixture("malicious.svg"));
  await page.getByLabel(/^Name/).fill("Blue square");
  await expect(page.getByTestId("nft-preview-image")).toHaveAttribute("src", /^blob:/);
  await page.getByTestId("nft-save").click();
  await expect(page.getByTestId("nft-files-saved")).toBeVisible();
  const src = await page.getByTestId("nft-preview-image").getAttribute("src");
  expect(src).toMatch(/^data:image\/svg\+xml;base64,/);
  const stored = Buffer.from(src.split(",")[1], "base64").toString();
  expect(stored).not.toMatch(/script|onload|foreignObject|iframe|evil/);
  expect(stored).toMatch(/<rect/);
  await expect(page.getByTestId("nft-preview").locator("img")).toHaveCount(1);
  expect(await page.locator("svg script, svg foreignObject, iframe").count()).toBe(0);
  expect(await page.getByTestId("nft-preview").locator("svg").count()).toBe(0);
  expect(world.metadataBodies[0].image).toBe(`ipfs://${DIR_CID}/image.svg`);
});

test("video + SVG cover: controls, no autoplay, poster; metadata gets animation_url and no blob:", async ({ page }) => {
  const world = await open(page);
  await page.getByTestId("nft-kind-video").click();
  await page.getByTestId("nft-video-input").setInputFiles(file("clip.mp4", "video/mp4", fixture("video.mp4")));
  await page.getByTestId("nft-cover-input").setInputFiles(file("cover.svg", "image/svg+xml", fixture("clean.svg")));
  await page.getByLabel(/^Name/).fill("Short clip");
  const video = page.getByTestId("nft-preview-video");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("controls", "");
  await expect(video).not.toHaveAttribute("autoplay", /.*/);
  await expect(video).toHaveAttribute("poster", /^blob:/);
  expect(await video.evaluate((el) => el.autoplay || !el.paused)).toBe(false);

  await page.getByTestId("nft-save").click();
  await expect(page.getByTestId("nft-files-saved")).toBeVisible({ timeout: 20_000 });
  expect(world.api.filter((entry) => !entry.startsWith("WALLET"))).toEqual([
    "POST image",
    "POST video/sign",
    "POST storage-upload",
    "POST video/verify",
    "POST metadata",
  ]);
  const meta = world.metadataBodies[0];
  expect(meta.image).toBe(`ipfs://${DIR_CID}/image.svg`);
  expect(meta.animationUrl).toBe(`ipfs://${VIDEO_CID}`);
  expect(JSON.stringify(meta)).not.toMatch(/blob:|data:/);
  await expect(video).toHaveAttribute("src", `https://gateway.pinata.cloud/ipfs/${VIDEO_CID}`);
  await expect(video).toHaveAttribute("preload", "none");

  await page.getByTestId("nft-mint").click();
  await expect(page.getByTestId("nft-result-video")).toBeVisible({ timeout: 20_000 });
  const result = page.getByTestId("nft-result-video");
  await expect(result).toHaveAttribute("controls", "");
  await expect(result).not.toHaveAttribute("autoplay", /.*/);
  await expect(result).toHaveAttribute("poster", /^data:image\/svg\+xml/);
});

test("a rejected oversize file and an upload failure show clear errors; retry succeeds", async ({ page }) => {
  const world = await open(page);
  await pickImage(page, "big.png", "image/png", Buffer.alloc(1_500_001, 1));
  await expect(page.getByTestId("nft-error")).toHaveAttribute("data-error-key", "errTooLarge");
  await pickImage(page, "art.png", "image/png", fixture("image.png"));
  await expect(page.getByTestId("nft-error")).toHaveCount(0);
  await page.getByLabel(/^Name/).fill("Retry me");

  world.imageStatus = 503;
  await page.getByTestId("nft-save").click();
  await expect(page.getByTestId("nft-error")).toHaveAttribute("data-error-key", "errStorageUnavailable");
  await expect(page.getByTestId("nft-save")).toHaveText(/try again/i);
  expect(world.sent).toHaveLength(0);

  world.imageStatus = 200;
  await page.getByTestId("nft-save").click();
  await expect(page.getByTestId("nft-files-saved")).toBeVisible();
  await expect(page.getByTestId("nft-error")).toHaveCount(0);
});

test("wallet rejection then retry sends exactly one mint", async ({ page }) => {
  const world = await open(page);
  await pickImage(page, "art.png", "image/png", fixture("image.png"));
  await page.getByLabel(/^Name/).fill("Reject once");
  await page.getByTestId("nft-save").click();
  await expect(page.getByTestId("nft-files-saved")).toBeVisible();
  world.rejectNextMint = true;
  await page.getByTestId("nft-mint").click();
  await expect(page.getByTestId("nft-error")).toHaveAttribute("data-error-key", "errWalletRejected");
  expect(mintSends(world)).toBe(0);
  await page.getByTestId("nft-mint").click();
  await expect(page.getByTestId("nft-peoplescan-link")).toBeVisible({ timeout: 20_000 });
  expect(mintSends(world)).toBe(1);
  // The collection from the first attempt was reused, not created again.
  expect(world.sent.filter((entry) => entry.fn === "createCollection")).toHaveLength(1);
});

test("a double tap sends one mint", async ({ page }) => {
  const world = await open(page);
  await pickImage(page, "art.png", "image/png", fixture("image.png"));
  await page.getByLabel(/^Name/).fill("Tap tap");
  await page.getByTestId("nft-save").click();
  await expect(page.getByTestId("nft-files-saved")).toBeVisible();
  await page.getByTestId("nft-mint").dblclick();
  await expect(page.getByTestId("nft-peoplescan-link")).toBeVisible({ timeout: 20_000 });
  expect(mintSends(world)).toBe(1);
});

test("reloading while the transaction is pending resumes without sending again", async ({ page }) => {
  const world = await open(page);
  await pickImage(page, "art.png", "image/png", fixture("image.png"));
  await page.getByLabel(/^Name/).fill("Resume me");
  await page.getByTestId("nft-save").click();
  await expect(page.getByTestId("nft-files-saved")).toBeVisible();
  const release = await holdReceipts(world);
  await page.getByTestId("nft-mint").click();
  await expect.poll(() => world.sent.map((entry) => entry.fn).join(",")).toBe("createCollection");
  // Still waiting for the collection receipt: reload now.
  await page.reload({ waitUntil: "domcontentloaded" });
  release();
  await expect(page.getByTestId("nft-resume-notice")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("nft-mint")).toHaveText(/continue/i);
  await expect(page.getByTestId("nft-mint")).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("nft-mint").click();
  await expect(page.getByTestId("nft-peoplescan-link")).toBeVisible({ timeout: 20_000 });
  expect(world.sent.map((entry) => entry.fn)).toEqual(["createCollection", "mint"]);
});

test("reload after the mint was sent never sends another one", async ({ page }) => {
  const world = await open(page);
  await pickImage(page, "art.png", "image/png", fixture("image.png"));
  await page.getByLabel(/^Name/).fill("Wait for mint");
  await page.getByTestId("nft-save").click();
  await expect(page.getByTestId("nft-files-saved")).toBeVisible();
  await page.getByTestId("nft-mint").click();
  await expect(page.getByTestId("nft-peoplescan-link")).toBeVisible({ timeout: 20_000 });
  // Pretend the page lost the result: restore the draft with the mint hash and an open receipt wait.
  const draftKey = await page.evaluate(() => Object.keys(localStorage).find((key) => key.startsWith("people_nft_mint_draft_v1")));
  await page.evaluate((key) => {
    const draft = JSON.parse(localStorage.getItem(key));
    draft.status = "in_progress";
    delete draft.tokenId;
    localStorage.setItem(key, JSON.stringify(draft));
  }, draftKey);
  expect(mintSends(world)).toBe(1);
  const release = await holdReceipts(world);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("nft-resume-notice")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("nft-mint")).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("nft-mint").click();
  release();
  await expect(page.getByTestId("nft-peoplescan-link")).toBeVisible({ timeout: 20_000 });
  expect(mintSends(world)).toBe(1);
});
