// AUDIT M8: sale orders must not be creatable anonymously. Route modules import `next/server`,
// which plain Node cannot load, so (like sale-evm-confirm.test.mjs) this checks the route source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src/app/api/sale/orders/route.ts"),
  "utf8",
);

test("order creation requires a session before touching the database", () => {
  assert.match(src, /await auth\(\)/);
  assert.match(src, /sign_in_required/);
  const authAt = src.indexOf("await auth()");
  const createAt = src.indexOf("await createSaleOrder(");
  assert.ok(authAt > 0 && createAt > authAt, "auth() must run before createSaleOrder()");
});

test("order creation keeps the per-IP limit and adds a durable per-account budget", () => {
  assert.match(src, /checkSlidingWindowRateLimit\("sale-order", ip/);
  assert.match(src, /checkDurableRateLimit\("sale-order-user", userId/);
  const budgetAt = src.indexOf("await userOrderBudgetAllowed(");
  assert.ok(budgetAt > src.indexOf("await auth()") && budgetAt < src.indexOf("await createSaleOrder("));
});
