import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..");
const catalogDocs = JSON.parse(readFileSync(join(repoRoot, "docs/roadmap.json"), "utf8"));
const catalog = JSON.parse(readFileSync(join(root, "src/lib/roadmap-catalog.data.json"), "utf8"));
assert.deepEqual(catalog, catalogDocs, "website/src/lib/roadmap-catalog.data.json must match docs/roadmap.json");
const en = JSON.parse(readFileSync(join(root, "src/lib/locales/surfaces/roadmap-en.json"), "utf8"));

const statuses = new Set([
  "done",
  "live_on_testnet",
  "in_progress",
  "proposed_pending_vote",
  "planned_unapproved",
]);

test("roadmap.json items have valid status and matching locale ids", () => {
  assert.ok(Array.isArray(catalog.items) && catalog.items.length > 0);
  for (const item of catalog.items) {
    assert.ok(statuses.has(item.status), item.id);
    assert.ok(typeof item.evidence === "string" && item.evidence.length > 10, item.id);
    assert.ok(en.items[item.id], `missing roadmap-en item ${item.id}`);
    assert.ok(en.items[item.id].title?.length > 2, item.id);
    assert.ok(en.items[item.id].summary?.length > 10, item.id);
  }
  const catalogIds = new Set(catalog.items.map((i) => i.id));
  for (const id of Object.keys(en.items)) {
    assert.ok(catalogIds.has(id), `orphan locale id ${id}`);
  }
});
