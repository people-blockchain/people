/**
 * Single source of truth for Litepaper / Whitepaper versioning on /litepaper.
 * Bump `version` + `dateLabel` and prepend a changelog entry when shipping a new release.
 */
export type DocsChangelogEntry = {
  version: string;
  dateLabel: string;
  /** English summary; UI localizes via surface keys keyed by version when present. */
  summaryKey: "initial" | "agentLive";
};

export const DOCS_RELEASE = {
  version: "v1.1",
  /** Display date shared by Litepaper + Whitepaper on /litepaper */
  dateLabel: "12 Oct 2026",
  /** ISO date for machines / tests */
  dateIso: "2026-10-12",
  changelog: [
    {
      version: "v1.1",
      dateLabel: "12 Oct 2026",
      summaryKey: "agentLive" as const,
    },
    {
      version: "v1.0",
      dateLabel: "11 Oct 2026",
      summaryKey: "initial" as const,
    },
  ] satisfies DocsChangelogEntry[],
} as const;

export function docsVersionLine(): string {
  return `${DOCS_RELEASE.version} · ${DOCS_RELEASE.dateLabel}`;
}
