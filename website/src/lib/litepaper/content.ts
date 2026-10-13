import fs from "node:fs";
import path from "node:path";
import type { Language } from "@/lib/preferences";
import { parseMarkdown, type ParsedMarkdown } from "./markdown";

const CONTENT_DIR = path.join(process.cwd(), "src/content/litepaper");

/**
 * Only `en.md` ships today; the other 11 locale files land later as plain
 * drops into `src/content/litepaper/<lang>.md` with no code change required.
 */
export function loadLitepaperMarkdown(lang: Language): ParsedMarkdown {
  const localized = path.join(CONTENT_DIR, `${lang}.md`);
  const file = fs.existsSync(localized) ? localized : path.join(CONTENT_DIR, "en.md");
  return parseMarkdown(fs.readFileSync(file, "utf8"));
}
