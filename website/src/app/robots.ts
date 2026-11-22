import type { MetadataRoute } from "next";
import { AI_SEARCH_USER_AGENTS, ROBOTS_DISALLOW } from "@/lib/seo/crawlers";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const disallow = [...ROBOTS_DISALLOW];
  const allowPublic = { userAgent: "*", allow: "/", disallow };
  const allowAi = AI_SEARCH_USER_AGENTS.map((userAgent) => ({
    userAgent,
    allow: "/",
    disallow,
  }));

  return {
    rules: [allowPublic, ...allowAi],
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
    host: SITE_URL,
  };
}