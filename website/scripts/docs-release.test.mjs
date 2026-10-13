import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS_RELEASE, docsVersionLine } from "../src/lib/docs-release.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("docs release is v1.1 · 12 Oct 2026 with agentLive changelog on top", () => {
  assert.equal(DOCS_RELEASE.version, "v1.1");
  assert.equal(DOCS_RELEASE.dateLabel, "12 Oct 2026");
  assert.equal(DOCS_RELEASE.dateIso, "2026-10-12");
  assert.equal(docsVersionLine(), "v1.1 · 12 Oct 2026");
  assert.equal(DOCS_RELEASE.changelog.length, 2);
  assert.equal(DOCS_RELEASE.changelog[0].summaryKey, "agentLive");
  assert.equal(DOCS_RELEASE.changelog[1].summaryKey, "initial");
});

test("whitepaper PDF is present for the /litepaper download button", () => {
  assert.ok(
    existsSync(join(root, "public/whitepaper/people-whitepaper.pdf")),
    "public/whitepaper/people-whitepaper.pdf must exist",
  );
});
