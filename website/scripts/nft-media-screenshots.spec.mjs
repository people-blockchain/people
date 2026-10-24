// Evidence screenshots for /create/nft: image, SVG, video with cover, stages and errors.
// Wallet, chain RPC and storage are mocked (see nft-media-mocks.mjs): not a live mint.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { fixture, holdReceipts, holdVideoUpload, installNftMocks } from "./nft-media-mocks.mjs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || process.env.SHOT_BASE_URL || "http://localhost:3111";
const OUT = process.env.NFT_MEDIA_SCREENSHOT_DIR ?? path.resolve("docs/screenshots/nft-media");

const NAMES = { en: "Green square", ru: "Зелёный квадрат", ar: "مربع أخضر" };
const TEXTS = {
  en: "A small demo item.",
  ru: "Небольшой пример для проверки.",
  ar: "عنصر تجريبي صغير.",
};

const file = (name, mimeType, buffer) => ({ name, mimeType, buffer });

async function shot(page, state, lang, theme, width) {
  await mkdir(OUT, { recursive: true });
  await page.locator("main").screenshot({ path: path.join(OUT, `${state}-${lang}-${theme}-${width}.png`) });
}

async function noHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function open(page, lang, theme, width) {
  await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
  const world = await installNftMocks(page, { lang, theme });
  await page.goto(`${BASE}/create/nft`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("nft-mint")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/2\.925/)).toBeVisible({ timeout: 15_000 });
  // Evidence only: a sticky header would otherwise float in the middle of element captures.
  await page.addStyleTag({ content: "header, nav { position: static !important; }" });
  return world;
}

async function fillDetails(page, lang) {
  await page.getByLabel(/^(Name|Название|الاسم)/).fill(NAMES[lang]);
  await page.locator("textarea").fill(TEXTS[lang]);
}

const MAIN = [
  ["en", "light", 390],
  ["en", "light", 1440],
  ["ru", "light", 390],
  ["ru", "light", 1440],
];

for (const [lang, theme, width] of MAIN) {
  test(`full flow shots ${lang} ${theme} ${width}`, async ({ page }) => {
    const world = await open(page, lang, theme, width);
    await shot(page, "form-image", lang, theme, width);

    // Image mode: SVG preview (local copy, shown through <img>).
    await page.getByTestId("nft-image-input").setInputFiles(file("art.svg", "image/svg+xml", fixture("clean.svg")));
    await fillDetails(page, lang);
    await expect(page.getByTestId("nft-preview-image")).toHaveAttribute("src", /^blob:/);
    await shot(page, "preview-svg", lang, theme, width);
    await noHorizontalScroll(page);

    // Too large file.
    await page.getByTestId("nft-image-input").setInputFiles(file("big.png", "image/png", Buffer.alloc(1_500_001, 1)));
    await expect(page.getByTestId("nft-error")).toHaveAttribute("data-error-key", "errTooLarge");
    await shot(page, "error-too-large", lang, theme, width);

    // Video mode with an SVG cover.
    await page.getByTestId("nft-kind-video").click();
    await page.getByTestId("nft-video-input").setInputFiles(file("clip.mp4", "video/mp4", fixture("video.mp4")));
    await page.getByTestId("nft-cover-input").setInputFiles(file("cover.svg", "image/svg+xml", fixture("clean.svg")));
    await expect(page.getByTestId("nft-preview-video")).toBeVisible();
    await expect(page.getByTestId("nft-error")).toHaveCount(0);
    await shot(page, "preview-video", lang, theme, width);
    await noHorizontalScroll(page);

    // Saving: the video upload is held so the stage list is caught mid-way.
    const releaseUpload = holdVideoUpload(world);
    await page.getByTestId("nft-save").click();
    await expect(page.getByTestId("nft-stages").locator('li[data-status="active"]')).toHaveCount(1);
    await expect.poll(() => world.videoUploadHeld).toBe(true);
    await shot(page, "stages-uploading", lang, theme, width);
    releaseUpload();
    await expect(page.getByTestId("nft-files-saved")).toBeVisible({ timeout: 20_000 });
    await shot(page, "stages-ready", lang, theme, width);

    // Signing: the receipt is held so "waiting for the transaction" is visible.
    const releaseReceipts = await holdReceipts(world);
    await page.getByTestId("nft-mint").click();
    await expect(page.getByTestId("nft-mint-stage")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => world.sent.length).toBeGreaterThan(0);
    await shot(page, "stages-waiting", lang, theme, width);
    releaseReceipts();
    await expect(page.getByTestId("nft-result-video")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("nft-peoplescan-link")).toBeVisible();
    await noHorizontalScroll(page);
    await shot(page, "result-video", lang, theme, width);
  });
}

for (const [lang, width] of [
  ["en", 1440],
  ["ru", 390],
]) {
  test(`error and svg result shots ${lang} ${width}`, async ({ page }) => {
    const world = await open(page, lang, "light", width);
    await fillDetails(page, lang);
    await page.getByTestId("nft-image-input").setInputFiles(file("art.svg", "image/svg+xml", fixture("malicious.svg")));

    world.imageStatus = 422;
    world.imageError = "svg_rejected";
    await page.getByTestId("nft-save").click();
    await expect(page.getByTestId("nft-error")).toHaveAttribute("data-error-key", "errSvgRejected");
    await shot(page, "error-svg-rejected", lang, "light", width);

    world.imageStatus = 503;
    world.imageError = "storage_unavailable";
    await page.getByTestId("nft-save").click();
    await expect(page.getByTestId("nft-error")).toHaveAttribute("data-error-key", "errStorageUnavailable");
    await shot(page, "error-storage", lang, "light", width);

    world.imageStatus = 200;
    await page.getByTestId("nft-image-input").setInputFiles(file("art.svg", "image/svg+xml", fixture("clean.svg")));
    await page.getByTestId("nft-save").click();
    await expect(page.getByTestId("nft-files-saved")).toBeVisible();
    await page.getByTestId("nft-mint").click();
    await expect(page.getByTestId("nft-result-image")).toBeVisible({ timeout: 20_000 });
    await shot(page, "result-svg", lang, "light", width);
  });
}

test("dark theme shots en", async ({ browser }) => {
  for (const width of [390, 1440]) {
    const page = await (await browser.newContext()).newPage();
    const world = await open(page, "en", "dark", width);
    await page.getByTestId("nft-kind-video").click();
    await page.getByTestId("nft-video-input").setInputFiles(file("clip.mp4", "video/mp4", fixture("video.mp4")));
    await page.getByTestId("nft-cover-input").setInputFiles(file("cover.png", "image/png", fixture("cover.png")));
    await fillDetails(page, "en");
    await expect(page.getByTestId("nft-preview-video")).toBeVisible();
    await shot(page, "preview-video", "en", "dark", width);
    await page.getByTestId("nft-save").click();
    await expect(page.getByTestId("nft-files-saved")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("nft-mint").click();
    await expect(page.getByTestId("nft-result-video")).toBeVisible({ timeout: 20_000 });
    await shot(page, "result-video", "en", "dark", width);
    expect(world.sent.length).toBe(2);
    await page.context().close();
  }
});

test("Arabic (right to left) and 360px overflow shots", async ({ browser }) => {
  const arabic = await (await browser.newContext()).newPage();
  const world = await open(arabic, "ar", "light", 390);
  await arabic.getByTestId("nft-kind-video").click();
  await arabic.getByTestId("nft-video-input").setInputFiles(file("clip.mp4", "video/mp4", fixture("video.mp4")));
  await arabic.getByTestId("nft-cover-input").setInputFiles(file("cover.svg", "image/svg+xml", fixture("clean.svg")));
  await fillDetails(arabic, "ar");
  await expect(arabic.getByTestId("nft-preview-video")).toBeVisible();
  await noHorizontalScroll(arabic);
  await shot(arabic, "form-video", "ar", "light", 390);
  await arabic.getByTestId("nft-save").click();
  await expect(arabic.getByTestId("nft-files-saved")).toBeVisible({ timeout: 20_000 });
  await arabic.getByTestId("nft-mint").click();
  await expect(arabic.getByTestId("nft-result-video")).toBeVisible({ timeout: 20_000 });
  await noHorizontalScroll(arabic);
  await shot(arabic, "result-video", "ar", "light", 390);
  expect(world.sent.length).toBe(2);

  const small = await (await browser.newContext()).newPage();
  await open(small, "ru", "light", 360);
  await small.getByTestId("nft-kind-video").click();
  await small.getByTestId("nft-video-input").setInputFiles(file("clip.mp4", "video/mp4", fixture("video.mp4")));
  await small.getByTestId("nft-cover-input").setInputFiles(file("cover.svg", "image/svg+xml", fixture("clean.svg")));
  await fillDetails(small, "ru");
  await noHorizontalScroll(small);
  await shot(small, "form-video", "ru", "light", 360);
});
