import assert from "node:assert/strict";
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const WIDTHS = [360, 390, 1280];

async function setLocale(page, lang = "en") {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("people_lang", value);
    } catch {
      /* ignore */
    }
  }, lang);
}

async function setTheme(page, theme) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("people_theme", value);
    } catch {
      /* ignore */
    }
  }, theme);
}

/** Mocks a signed-in session so the FAB (hidden for anonymous visitors) renders. */
async function mockSignedIn(page, user = { id: "e2e-user-1", email: "e2e@example.com" }) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) }),
  );
}

async function mockSignedOut(page) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );
}

test.describe("bug report button", () => {
  for (const width of WIDTHS) {
    for (const theme of ["light", "dark"]) {
      test(`visible, within viewport, no header overlap @ ${width}px ${theme}`, async ({ page }) => {
        await setLocale(page, "en");
        await setTheme(page, theme);
        await mockSignedIn(page);
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

        const fab = page.locator("#bug-report-fab");
        await expect(fab).toBeVisible();

        const metrics = await page.evaluate(() => {
          const fabEl = document.getElementById("bug-report-fab");
          const headerEl = document.querySelector("header");
          const fabRect = fabEl.getBoundingClientRect();
          const headerRect = headerEl ? headerEl.getBoundingClientRect() : null;
          const overlaps = (a, b) => a && b && a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
          return {
            fab: { top: fabRect.top, left: fabRect.left, right: fabRect.right, bottom: fabRect.bottom },
            overlapsHeader: overlaps(fabRect, headerRect),
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            isDark: document.documentElement.classList.contains("dark"),
          };
        });

        assert.ok(!metrics.overlapsHeader, `${width}px/${theme}: FAB must not overlap the sticky header`);
        assert.ok(metrics.fab.right <= metrics.viewportWidth, `${width}px/${theme}: FAB must stay within the viewport width`);
        assert.ok(metrics.fab.bottom <= metrics.viewportHeight, `${width}px/${theme}: FAB must stay within the viewport height`);
        assert.ok(metrics.fab.left >= 0 && metrics.fab.top >= 0, `${width}px/${theme}: FAB must not be clipped off-screen`);
        assert.equal(metrics.isDark, theme === "dark", `${width}px: document theme class should reflect ${theme}`);
      });
    }
  }

  test("hidden for signed-out visitors", async ({ page }) => {
    await setLocale(page, "en");
    await mockSignedOut(page);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await expect(page.locator("#bug-report-fab")).toHaveCount(0);
  });

  test("hidden on /login even when signed in", async ({ page }) => {
    await setLocale(page, "en");
    await mockSignedIn(page);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await expect(page.locator("#bug-report-fab")).toHaveCount(0);
  });

  test("dialog opens with the description field and a capture-screenshot control", async ({ page }) => {
    await setLocale(page, "en");
    await mockSignedIn(page);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

    await page.locator("#bug-report-fab").click();
    await expect(page.locator("#bug-report-description")).toBeVisible();
    await expect(page.getByRole("button", { name: /capture screenshot/i })).toBeVisible();
  });

  test("submit posts to /api/bugs and shows the thank-you state (mocked API)", async ({ page }) => {
    await setLocale(page, "en");
    await mockSignedIn(page);

    let postedBody = null;
    await page.route("**/api/bugs", (route) => {
      if (route.request().method() === "POST") {
        postedBody = JSON.parse(route.request().postData() ?? "{}");
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: "mock-1" }) });
      }
      return route.continue();
    });

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.locator("#bug-report-fab").click();
    await page.locator("#bug-report-description").fill("The swap button does nothing on mobile Safari.");
    await page.getByRole("button", { name: /submit report/i }).click();

    await expect(page.getByText(/thanks|спасибо/i)).toBeVisible({ timeout: 10000 });
    assert.equal(postedBody?.description, "The swap button does nothing on mobile Safari.");
    assert.equal(typeof postedBody?.context?.url, "string");
    assert.equal(postedBody?.context?.locale, "en");
  });

  test("submit shows an inline error when the API rate-limits (429, mocked)", async ({ page }) => {
    await setLocale(page, "en");
    await mockSignedIn(page);
    await page.route("**/api/bugs", (route) =>
      route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "rate_limited" }) }),
    );

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.locator("#bug-report-fab").click();
    await page.locator("#bug-report-description").fill("Something is broken.");
    await page.getByRole("button", { name: /submit report/i }).click();

    await expect(page.getByText(/too many reports|слишком много отчётов/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("bug report API auth/authz (unmocked, real server)", () => {
  test("GET /api/bugs/mine requires sign-in", async ({ request }) => {
    const res = await request.get(`${BASE}/api/bugs/mine`);
    assert.equal(res.status(), 401);
  });

  test("POST /api/bugs requires sign-in", async ({ request }) => {
    const res = await request.post(`${BASE}/api/bugs`, { data: { description: "x" } });
    assert.equal(res.status(), 401);
  });

  test("GET and PATCH /api/bugs/admin are forbidden without admin auth", async ({ request }) => {
    const getRes = await request.get(`${BASE}/api/bugs/admin`);
    assert.equal(getRes.status(), 403);
    const patchRes = await request.patch(`${BASE}/api/bugs/admin`, { data: { id: "x", status: "accepted" } });
    assert.equal(patchRes.status(), 403);
  });
});
