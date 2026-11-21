/** Crawlers named in the public SEO guidance — allowed the same public paths as everyone else. */
export const AI_SEARCH_USER_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "Google-Extended",
  "Googlebot",
] as const;

/** Paths that must stay out of indexes (auth, partner cabinet, APIs). */
export const ROBOTS_DISALLOW = [
  "/partner",
  "/admin",
  "/login",
  "/account",
  "/api/",
  "/__people-analytics-view",
] as const;