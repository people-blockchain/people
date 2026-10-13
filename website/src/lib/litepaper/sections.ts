import type { InlineNode, MdBlock } from "./markdown";

/** Locale-stable chart wiring key (heading slugs are localized). */
export type LitepaperChartSlot =
  | "technology"
  | "tokenomics"
  | "founders"
  | "roadmap"
  | "differ"
  | null;

export type LitepaperSection = {
  id: string;
  title: string;
  eyebrow: string;
  /** Chart cluster for this section; derived from section order, not slug language. */
  chartSlot: LitepaperChartSlot;
  blocks: MdBlock[];
};

function plainText(inline: InlineNode[]): string {
  return inline.map((n) => n.text).join("");
}

/** Map 1-based ## order → chart slot. Order matches every locale markdown file. */
function chartSlotForIndex(index: number): LitepaperChartSlot {
  switch (index) {
    case 5:
      return "technology";
    case 6:
      return "tokenomics";
    case 7:
      return "founders";
    case 8:
      return "roadmap";
    case 12:
      return "differ";
    default:
      return null;
  }
}


/**
 * Groups the body blocks (everything after the hero `hr`) into one section per
 * `##` heading, stripping the `N. ` prefix into a numbered eyebrow pill. Lets
 * the page wrap every section in a card without hand-maintaining a parallel
 * structure next to the markdown source.
 */
export function groupLitepaperSections(blocks: MdBlock[]): LitepaperSection[] {
  const sections: LitepaperSection[] = [];
  let current: LitepaperSection | null = null;
  let index = 0;

  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) {
      index += 1;
      const text = plainText(block.inline);
      current = {
        id: block.id,
        title: text.replace(/^\d+\.\s*/, ""),
        eyebrow: String(index).padStart(2, "0"),
        chartSlot: chartSlotForIndex(index),
        blocks: [],
      };
      sections.push(current);
      continue;
    }
    current?.blocks.push(block);
  }

  return sections;
}

/** Splits off a leading paragraph so a chart can sit between the lead and the rest. */
export function splitLeadParagraph(blocks: MdBlock[]): { lead: MdBlock | null; rest: MdBlock[] } {
  if (blocks[0]?.type === "paragraph") {
    return { lead: blocks[0], rest: blocks.slice(1) };
  }
  return { lead: null, rest: blocks };
}

/** Pulls the first table out of a section so it can be replaced by a custom visual. */
export function extractFirstTable(blocks: MdBlock[]): {
  before: MdBlock[];
  table: (MdBlock & { type: "table" }) | null;
  after: MdBlock[];
} {
  const tableIndex = blocks.findIndex((b) => b.type === "table");
  if (tableIndex === -1) return { before: blocks, table: null, after: [] };
  return {
    before: blocks.slice(0, tableIndex),
    table: blocks[tableIndex] as MdBlock & { type: "table" },
    after: blocks.slice(tableIndex + 1),
  };
}
