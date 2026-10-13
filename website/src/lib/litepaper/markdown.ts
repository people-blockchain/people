/**
 * Minimal markdown parser for the litepaper source files. Covers exactly the
 * subset used in `src/content/litepaper/*.md`: frontmatter, headings,
 * paragraphs, bullet/numbered lists, pipe tables, blockquotes, hr, bold,
 * italic, markdown links and bare URLs. No HTML is ever produced — callers
 * render the returned plain-data AST themselves (see `renderer.tsx`).
 */

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "link"; text: string; href: string };

export type TableAlign = "left" | "right" | "center";

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; id: string; inline: InlineNode[] }
  | { type: "paragraph"; inline: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "table"; align: TableAlign[]; header: InlineNode[][]; rows: InlineNode[][][] }
  | { type: "blockquote"; lines: InlineNode[][] }
  | { type: "hr" };

export type ParsedMarkdown = {
  frontmatter: Record<string, string>;
  blocks: MdBlock[];
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const INLINE_RE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|(https?:\/\/[^\s)]+)/g;

export function parseInline(raw: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  for (const m of raw.matchAll(INLINE_RE)) {
    const index = m.index ?? 0;
    if (index > last) nodes.push({ type: "text", text: raw.slice(last, index) });
    if (m[1] !== undefined && m[2] !== undefined) {
      nodes.push({ type: "link", text: m[1], href: m[2] });
    } else if (m[3] !== undefined) {
      nodes.push({ type: "bold", text: m[3] });
    } else if (m[4] !== undefined) {
      nodes.push({ type: "italic", text: m[4] });
    } else if (m[5] !== undefined) {
      nodes.push({ type: "link", text: m[5], href: m[5] });
    }
    last = index + m[0].length;
  }
  if (last < raw.length) nodes.push({ type: "text", text: raw.slice(last) });
  return nodes;
}

function splitFrontmatter(src: string): { frontmatter: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!match) return { frontmatter: {}, body: src };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    frontmatter[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return { frontmatter, body: src.slice(match[0].length) };
}

function parseTableRow(line: string): string[] {
  let cells = line.trim();
  if (cells.startsWith("|")) cells = cells.slice(1);
  if (cells.endsWith("|")) cells = cells.slice(0, -1);
  return cells.split("|").map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes("-");
}

function alignOf(cell: string): TableAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

export function parseMarkdown(src: string): ParsedMarkdown {
  const { frontmatter, body } = splitFrontmatter(src);
  const lines = body.split(/\r?\n/);
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      const text = heading[2].trim();
      blocks.push({ type: "heading", level, id: slugify(text), inline: parseInline(text) });
      i += 1;
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: InlineNode[][] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(parseInline(lines[i].trim().replace(/^>\s?/, "")));
        i += 1;
      }
      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    if (trimmed.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const headerCells = parseTableRow(tableLines[0]);
      const sepCells = tableLines[1] && isTableSeparator(tableLines[1]) ? parseTableRow(tableLines[1]) : [];
      const dataLines = sepCells.length ? tableLines.slice(2) : tableLines.slice(1);
      const align: TableAlign[] = headerCells.map((_, col) => alignOf(sepCells[col] ?? ""));
      blocks.push({
        type: "table",
        align,
        header: headerCells.map((c) => parseInline(c)),
        rows: dataLines.map((row) => parseTableRow(row).map((c) => parseInline(c))),
      });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const itemRe = ordered ? /^\d+\.\s+(.*)$/ : /^[-*]\s+(.*)$/;
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const m = itemRe.exec(lines[i].trim());
        if (!m) break;
        items.push(parseInline(m[1]));
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    blocks.push({ type: "paragraph", inline: parseInline(trimmed) });
    i += 1;
  }

  return { frontmatter, blocks };
}
