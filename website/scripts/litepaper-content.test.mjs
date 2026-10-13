import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMarkdown } from "../src/lib/litepaper/markdown.ts";
import { SITE_ROUTES } from "../src/lib/site.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const en = readFileSync(join(root, "src/content/litepaper/en.md"), "utf8");

test("/litepaper is a registered site route", () => {
  assert.ok(SITE_ROUTES.some((r) => r.path === "/litepaper"));
});

test("en.md parses frontmatter, hero, headings and tables", () => {
  const { frontmatter, blocks } = parseMarkdown(en);
  assert.equal(frontmatter.status, "preliminary");
  assert.ok(frontmatter.title.length > 0);

  const h1 = blocks.find((b) => b.type === "heading" && b.level === 1);
  assert.ok(h1, "expected an h1 title");

  const quote = blocks.find((b) => b.type === "blockquote");
  assert.ok(quote && quote.lines.length >= 2, "expected the tagline blockquote");

  const h2s = blocks.filter((b) => b.type === "heading" && b.level === 2);
  assert.ok(h2s.length >= 5, "expected several h2 sections for the TOC");
  assert.ok(h2s.every((h) => h.id.length > 0));

  const tables = blocks.filter((b) => b.type === "table");
  assert.ok(tables.length >= 3, "expected pipe tables (at a glance, allocation, fee split...)");
  for (const t of tables) {
    assert.ok(t.rows.length > 0);
    for (const row of t.rows) assert.equal(row.length, t.header.length);
  }

  const hrCount = blocks.filter((b) => b.type === "hr").length;
  assert.ok(hrCount > 0);
});

test("inline parser renders bold, italic, markdown links and bare URLs without HTML", () => {
  const { blocks } = parseMarkdown(
    "# T\n\n> q\n\n---\n\n**bold** and *italic* and [text](https://example.com) and https://bare.example.com\n",
  );
  const paragraph = blocks.find((b) => b.type === "paragraph");
  assert.deepEqual(
    paragraph.inline.map((n) => n.type),
    ["bold", "text", "italic", "text", "link", "text", "link"],
  );
  const link = paragraph.inline.find((n) => n.type === "link" && n.text === "text");
  assert.equal(link.href, "https://example.com");
  const bare = paragraph.inline.find((n) => n.type === "link" && n.href === "https://bare.example.com");
  assert.ok(bare);
});
