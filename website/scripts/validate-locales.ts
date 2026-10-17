import { en } from "../src/lib/locales/en";

const CYRILLIC_REGEX = /[\u0400-\u04FF]/;

// Known technical terms / formulas / invariant expressions that are validly identical to English across all languages
const ALLOWED_IDENTICAL = new Set([
  "div(n, d) = ⌊n / d⌋; rem = n % d",
  "∑(balances) + reserves ≡ TotalSupply",
  "ConsensusQuorum ⊥ MobilePower",
  "K = X * Y",
  "K = X · Y",
  "K = X · Y (integer)",
  "Power ∝ Base × A × R × C (PowerCap, TBD)",
  "Power ∝ Base × Activity × Reputation × Contribution",
  "Testnet v0.1",
  "Economic Model v0.1",
  "ECONOMIC-MODEL-v0.1.md",
  "PEOPLE // PROTOCOL SPECIFICATION",
  "04 // HOW IT WORKS",
  "01 // LEDGER",
  "02 // PARTICIPATION",
  "03 // POWER",
  "04 // PIPELINE",
  "05 // MICRO-CHAIN",
  "06 // COMMUNITY POOL",
  "07 // DISTRIBUTION",
  "08 // DEFENSE",
  "09 // FLYWHEEL",
  "10 // DEPLOYMENT",
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "PPL", "BFT", "PoS", "AMM", "PII", "People", "PEOPLE Blockchain",
  "#concept", "#audiences", "#architecture", "#specifications", "#phase-1", "#phase-2", "#phase-3",
  "emerald", "amber", "sky", "brand", "value", "violet", "warm", "muted",
  "creators", "token-economy", "community-pool", "human-network", "peoples-blockchain",
  "multi-asset-ledger", "feesplitter", "token-factory", "bonding-curve", "creator-vesting",
  "liquidity-migration", "mobile-mining", "proof-of-humanity", "anti-sybil", "participation-power",
  "step-1", "step-2", "step-3", "step-4", "step-5",
  "ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8", "ch9", "ch10",
  "sec-intro", "sec-mobile", "sec-power", "sec-pipeline", "sec-microchain", "sec-pool", "sec-math", "sec-defense", "sec-flywheel", "sec-roadmap",
  "c1", "c2", "c3", "c4", "c5",
  "d1", "d2", "d3", "d4",
  "l1", "l2", "l3", "l4",
  "p1", "p2", "p3",
  "A", "B", "C",
  "25%", "10%", "60%", "15%", "5%", "40%", "20%", "50%", "30%", "1.00%", "90%",
  "1,000,000 PPL", "60 PPL", "1 PPL", "10 PPL", "25 PPL",
  "10,000 PPL", "2,500 PPL", "2,000 PPL", "1,000 PPL", "500 PPL",
  "400 PPL", "250 PPL", "200 PPL", "100 PPL", "50 PPL"
]);

export function validateLocale(code: string, localeObj: Record<string, unknown>) {
  const errors: string[] = [];
  const warnings: string[] = [];

  function checkKeys(enSub: unknown, locSub: unknown, path: string) {
    if (typeof enSub !== typeof locSub) {
      errors.push(`Type mismatch at ${path}: expected ${typeof enSub}, got ${typeof locSub}`);
      return;
    }

    if (Array.isArray(enSub)) {
      if (!Array.isArray(locSub)) {
        errors.push(`Array mismatch at ${path}: expected Array, got ${typeof locSub}`);
        return;
      }
      if (enSub.length !== locSub.length) {
        errors.push(`Array length mismatch at ${path}: expected ${enSub.length}, got ${locSub.length}`);
      }
      for (let i = 0; i < enSub.length; i++) {
        checkKeys(enSub[i], locSub[i], `${path}[${i}]`);
      }
      return;
    }

    if (typeof enSub === "object" && enSub !== null && typeof locSub === "object" && locSub !== null) {
      const enRecord = enSub as Record<string, unknown>;
      const locRecord = locSub as Record<string, unknown>;
      const enKeys = Object.keys(enRecord);
      const locKeys = new Set(Object.keys(locRecord));

      for (const k of enKeys) {
        if (!locKeys.has(k)) {
          errors.push(`Missing key at ${path}.${k}`);
        } else {
          checkKeys(enRecord[k], locRecord[k], `${path}.${k}`);
        }
      }
      for (const k of locKeys) {
        if (!(k in enRecord)) {
          errors.push(`Extraneous key at ${path}.${k}`);
        }
      }
      return;
    }

    if (typeof enSub === "string") {
      const val = locSub;
      if (enSub.trim() !== "" && (!val || typeof val !== "string" || val.trim() === "")) {
        errors.push(`Empty or invalid string at ${path}`);
        return;
      }

      // Check for accidental Cyrillic in non-Russian files
      if (code !== "ru" && typeof val === "string" && CYRILLIC_REGEX.test(val)) {
        errors.push(`Cyrillic character found in ${code} at ${path}: "${val}"`);
      }

      // Check for untranslated long English sentences
      if (code !== "en" && typeof val === "string" && val === enSub && enSub.length > 25 && !ALLOWED_IDENTICAL.has(enSub.trim())) {
        warnings.push(`Possibly untranslated English string in ${code} at ${path}: "${val.slice(0, 40)}..."`);
      }
    }
  }

  checkKeys(en, localeObj, code);

  return { errors, warnings };
}
