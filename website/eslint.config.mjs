import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Legitimate data-fetch / hydration patterns; React Compiler rule is too noisy for this codebase.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Throwaway scratch from scripts/generate-og-images.py (gitignored too).
    ".og-work/**",
    "drizzle.config.ts",
    "src/lib/partner/*.test.ts",
    "scripts/validate-locales.cjs",
    "playwright.evm-screenshots.config.mjs",
    "scripts/header-desktop-layout.spec.mjs",
    "scripts/hero-headline-layout.spec.mjs",
    // Live end-to-end pass: Playwright specs + config (browser globals, no TS).
    "e2e/**",
  ]),
]);

export default eslintConfig;
