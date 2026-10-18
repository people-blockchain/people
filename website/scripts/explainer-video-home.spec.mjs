/**
 * Homepage explainer video: present under the hero, poster reserved (no CLS),
 * play control visible, no horizontal overflow. RU/EN × light/dark × 360/390/1280.
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const OUT =
  process.env.EXPLAINER_SHOT_DIR ??
  path.resolve("docs/screenshots/explainer-video");

const WIDTHS = [
  { width: 360, height: 740, label: "360" },
  { width: 390, height: 844, label: "390" },
  { width: 1280, height: 900, label: "1280" },
];

async function setPrefs(page, { lang, theme }) {
  await page.addInitScript(
    ({ lang: l, theme: t }) => {
      try {
        localStorage.setItem("people_lang", l);
        localStorage.setItem("people_theme", t);
        document.documentElement.classList.toggle("dark", t === "dark");
        document.documentElement.dataset.theme = t;
      } catch {
        /* ignore */
      }
    },
    { lang, theme },
  );
}

for (const lang of ["en", "ru"]) {
  for (const theme of ["light", "dark"]) {
    for (const { width, height, label } of WIDTHS) {
      test(`explainer @ ${lang} ${theme} ${label}`, async ({ page }) => {
        fs.mkdirSync(OUT, { recursive: true });
        await setPrefs(page, { lang, theme });
        await page.setViewportSize({ width, height });
        await page.goto("/", { waitUntil: "domcontentloaded" });

        const hero = page.getByTestId("home-hero");
        const section = page.getByTestId("explainer-video-section");
        await expect(hero).toBeVisible();
        await expect(section).toBeVisible();

        // Section sits after the hero in document order.
        const order = await page.evaluate(() => {
          const h = document.querySelector('[data-testid="home-hero"]');
          const v = document.querySelector('[data-testid="explainer-video-section"]');
          if (!h || !v) return -1;
          return h.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : 0;
        });
        expect(order).toBe(1);

        await section.scrollIntoViewIfNeeded();
        const video = page.getByTestId("explainer-video-el");
        await expect(video).toBeVisible();
        await expect(page.getByTestId("explainer-video-play")).toBeVisible();

        const box = await video.boundingBox();
        expect(box).toBeTruthy();
        // 16:9 reserved — height must be meaningful (no collapse / CLS hole).
        expect(box.height).toBeGreaterThan(width < 500 ? 140 : 200);

        const muted = await video.evaluate((el) => el.muted);
        const playsInline = await video.evaluate((el) => el.playsInline);
        const preload = await video.evaluate((el) => el.preload);
        expect(muted).toBe(true);
        expect(playsInline).toBe(true);
        expect(preload).toBe("none");

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);

        await page.screenshot({
          path: path.join(OUT, `home-explainer-${lang}-${theme}-${label}.png`),
          fullPage: false,
        });
      });
    }
  }
}
