"use client";

/**
 * /founders primitives. The implementation now lives in the shared
 * `@/components/warm/warm-ui` module so the homepage and /how-it-works can use
 * the same warm palette, cards, counters and motion. This re-export keeps every
 * existing `/founders` import path working unchanged.
 */
export * from "@/components/warm/warm-ui";
