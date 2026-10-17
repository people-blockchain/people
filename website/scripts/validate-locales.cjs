const fs = require("node:fs");
const path = require("node:path");

const CYRILLIC_REGEX = /[\u0400-\u04FF]/;

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

function loadLocale(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  // extract JSON portion
  const match = content.match(/=\s*({[\s\S]*});?\s*$/);
  if (!match) throw new Error("Could not parse object from " + filePath);
  // parse object
  const fn = new Function("return " + match[1]);
  return fn();
}

function validateLocale(code, locSub, enSub, path = code) {
  const errors = [];
  const warnings = [];

  function check(enVal, locVal, curPath) {
    if (typeof enVal !== typeof locVal) {
      errors.push(`Type mismatch at ${curPath}: expected ${typeof enVal}, got ${typeof locVal}`);
      return;
    }

    if (Array.isArray(enVal)) {
      if (!Array.isArray(locVal)) {
        errors.push(`Array mismatch at ${curPath}: expected Array, got ${typeof locVal}`);
        return;
      }
      if (enVal.length !== locVal.length) {
        errors.push(`Array length mismatch at ${curPath}: expected ${enVal.length}, got ${locVal.length}`);
      }
      for (let i = 0; i < enVal.length; i++) {
        check(enVal[i], locVal[i], `${curPath}[${i}]`);
      }
      return;
    }

    if (typeof enVal === "object" && enVal !== null) {
      const enKeys = Object.keys(enVal);
      const locKeys = new Set(Object.keys(locVal));

      for (const k of enKeys) {
        if (!locKeys.has(k)) {
          errors.push(`Missing key at ${curPath}.${k}`);
        } else {
          check(enVal[k], locVal[k], `${curPath}.${k}`);
        }
      }
      for (const k of locKeys) {
        if (!(k in enVal)) {
          errors.push(`Extraneous key at ${curPath}.${k}`);
        }
      }
      return;
    }

    if (typeof enVal === "string") {
      const val = locVal;
      if (enVal.trim() !== "" && (!val || typeof val !== "string" || val.trim() === "")) {
        errors.push(`Empty or invalid string at ${curPath}`);
        return;
      }

      if (code !== "ru" && CYRILLIC_REGEX.test(val)) {
        errors.push(`Cyrillic character found in ${code} at ${curPath}: "${val}"`);
      }

      if (code !== "en" && val === enVal && enVal.length > 25 && !ALLOWED_IDENTICAL.has(enVal.trim())) {
        warnings.push(`Possibly untranslated English string in ${code} at ${curPath}: "${val.slice(0, 40)}..."`);
      }
    }
  }

  check(enSub, locSub, path);
  return { errors, warnings };
}

module.exports = { loadLocale, validateLocale };

if (require.main === module) {
  const en = loadLocale(path.join(__dirname, "../src/lib/locales/en.ts"));
  const ru = loadLocale(path.join(__dirname, "../src/lib/locales/ru.ts"));
  const res = validateLocale("ru", ru, en);
  console.log("Validation for ru:", res.errors.length, "errors,", res.warnings.length, "warnings");
  if (res.errors.length > 0) {
    console.error(res.errors);
    process.exit(1);
  }
}
