import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";

const LOCALES = ["en", "ru"];
const WIDTHS = [360, 1280];
const THEMES = ["light", "dark"];

const ARTIFACT_ROOT = process.env.HEADER_LOGO_SCREENSHOT_DIR ?? path.join(tmpdir(), "people-header-logo-theme");

async function setPrefs(page, lang, theme) {
  await page.addInitScript(
    ({ language, theme: t }) => {
      try {
        localStorage.setItem("people_lang", language);
        localStorage.setItem("people_theme", t);
      } catch {
        /* ignore */
      }
    },
    { language: lang, theme }
  );
}

function activeLockupTestId(width) {
  return width < 768 ? "header-brand-lockup-mobile" : "header-brand-lockup";
}

async function assertSingleVisibleHeaderLogo(page, width) {
  const testId = activeLockupTestId(width);
  const logos = page.locator(`[data-testid="${testId}"] img.header-lockup-theme`);
  await expect(logos).toHaveCount(2);

  const visibleCount = await logos.evaluateAll((imgs) =>
    imgs.filter((img) => {
      const style = window.getComputedStyle(img);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = img.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length
  );

  assert.equal(visibleCount, 1, "expected exactly one visible header lockup image");
}

test.describe("header logo theme swap", () => {
  for (const theme of THEMES) {
    for (const lang of LOCALES) {
      for (const width of WIDTHS) {
        test(`${theme} / ${lang} / ${width}px — one logo visible`, async ({ page }) => {
          await setPrefs(page, lang, theme);
          await page.setViewportSize({ width, height: 720 });
          await page.goto("/");
          const lockupTestId = width < 768 ? "header-brand-lockup-mobile" : "header-brand-lockup";
          await page.waitForFunction((id) => {
            const imgs = [...document.querySelectorAll(`[data-testid="${id}"] img.header-lockup-theme`)];
            return imgs.some((img) => {
              const style = getComputedStyle(img);
              if (style.display === "none" || style.visibility === "hidden") return false;
              const rect = img.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
          }, lockupTestId);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(40);

          const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
          assert.equal(isDark, theme === "dark", `html.dark mismatch for theme=${theme}`);

          await assertSingleVisibleHeaderLogo(page, width);

          const dir = path.join(ARTIFACT_ROOT, theme, lang);
          await mkdir(dir, { recursive: true });
          await page.screenshot({
            path: path.join(dir, `header-${width}.png`),
            fullPage: false,
          });
        });
      }
    }
  }
});
