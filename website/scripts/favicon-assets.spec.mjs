import { test, expect } from "@playwright/test";

test("favicon, apple-touch, and manifest URLs return image or manifest content", async ({
  request,
  page,
}) => {
  for (const path of ["/favicon.ico", "/brand/icon-32.png", "/brand/apple-touch-icon.png"]) {
    const res = await request.get(path);
    expect(res.ok(), path).toBeTruthy();
    expect(res.headers()["content-type"] ?? "").toMatch(/image\//);
  }

  const manifest = await request.get("/site.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect(manifest.headers()["content-type"] ?? "").toMatch(/json/);

  await page.goto("/");
  const html = await page.content();
  expect(html).toMatch(/rel="icon" href="\/favicon.ico"/);
  expect(html).toMatch(/apple-touch-icon/);
  expect(html).toMatch(/site\.webmanifest/);
});
