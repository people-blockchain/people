import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { languageFromRequest } from "@/lib/locale-detect";
import { LANG_COOKIE } from "@/lib/preferences";
import { buildPageMetadata } from "@/lib/og-meta";
import { loadLitepaperMarkdown } from "@/lib/litepaper/content";
import type { InlineNode, MdBlock } from "@/lib/litepaper/markdown";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { LitepaperApp } from "@/components/litepaper/LitepaperApp";
import { existsSync } from "node:fs";
import path from "node:path";

async function resolveLang(): Promise<ReturnType<typeof languageFromRequest>> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return languageFromRequest(cookieStore.get(LANG_COOKIE)?.value, headerStore.get("accept-language"));
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await resolveLang();
  return buildPageMetadata("litepaper", lang);
}

export const dynamic = "force-dynamic";

function plainText(inline: InlineNode[]): string {
  return inline.map((n) => n.text).join("");
}

/**
 * Everything before the first `hr` is the hero: h1 title, blockquote tagline,
 * then up to two paragraphs — the mission line, then the preliminary caption.
 */
function splitHero(blocks: MdBlock[]) {
  const hrIndex = blocks.findIndex((b) => b.type === "hr");
  const heroBlocks = hrIndex === -1 ? [] : blocks.slice(0, hrIndex);
  const bodyBlocks = hrIndex === -1 ? blocks : blocks.slice(hrIndex + 1);

  const h1 = heroBlocks.find((b) => b.type === "heading" && b.level === 1);
  const quote = heroBlocks.find((b) => b.type === "blockquote");
  const paragraphs = heroBlocks
    .filter((b): b is MdBlock & { type: "paragraph" } => b.type === "paragraph")
    .map((b) => plainText(b.inline));

  return {
    heroTitle: h1 && h1.type === "heading" ? plainText(h1.inline) : "",
    heroTagline: quote && quote.type === "blockquote" ? quote.lines.map(plainText) : [],
    mission: paragraphs[0] ?? "",
    caption: paragraphs[1] ?? "",
    bodyBlocks,
  };
}

export default async function LitepaperPage() {
  const lang = await resolveLang();
  const { blocks } = loadLitepaperMarkdown(lang);
  const { heroTitle, heroTagline, mission, caption, bodyBlocks } = splitHero(blocks);
  const whitepaperAvailable = existsSync(
    path.join(process.cwd(), "public/whitepaper/people-whitepaper.pdf"),
  );
  const headings = bodyBlocks
    .filter((b): b is MdBlock & { type: "heading" } => b.type === "heading" && b.level === 2)
    .map((b) => ({ id: b.id, text: plainText(b.inline) }));

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <LitepaperApp
          heroTitle={heroTitle}
          heroTagline={heroTagline}
          mission={mission}
          caption={caption}
          blocks={bodyBlocks}
          headings={headings}
          whitepaperAvailable={whitepaperAvailable}
        />
      </main>
      <Footer />
    </div>
  );
}
