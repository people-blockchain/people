import { buyCopy } from "@/lib/buy-content";
import { buyCopyVars } from "@/lib/sale/buy-page";
import { fillCopy } from "@/lib/sale/format";
import { tokenomicsCopy } from "@/lib/tokenomics-content";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";
import { mainnetOpenDateLabel } from "./json-ld";

/**
 * Plain-text summary for AI crawlers (`/llms.txt`). Built only from on-site copy
 * modules — no numbers invented here.
 */
export function buildLlmsTxt(): string {
  const enBuy = buyCopy.en;
  const vars = buyCopyVars("en");
  const tokenomics = tokenomicsCopy.en;
  const openDate = mainnetOpenDateLabel("en");
  const buyFaq = enBuy.faq.items
    .map((item) => `- Q: ${fillCopy(item.q, vars)}\n  A: ${fillCopy(item.a, vars)}`)
    .join("\n");

  return `# ${SITE_NAME} (${SITE_URL})
> ${SITE_DESCRIPTION}

## Primary pages for launch and PPL
- ${SITE_URL}/buy — ${fillCopy(enBuy.hero.subUpcoming, { ...vars, date: openDate })} Payment: USDC/USDT on Base; PPL credited on PEOPLE Mainnet Beta.
- ${SITE_URL}/tokenomics — ${tokenomics.lead}
- ${SITE_URL}/help — Short answer-first FAQ linked to docs, fees, wallet and the sale.
- ${SITE_URL}/litepaper — Product overview, roadmap and risks (localized).
- ${SITE_URL}/founders — Participation program and referrals (testnet points; not investment).
- ${SITE_URL}/bounty — Partner / growth program overview and tasks.
- ${SITE_URL}/docs — Participant documentation for the public testnet and planned Mainnet Beta.

## PPL sale FAQ (from /buy)
${buyFaq}

## Policies
- Testnet tokens and demo balances are not income. See risk sections on /buy and /tokenomics.
- The 1 December 2026 opening is PEOPLE Mainnet Beta (mainnet at an early stage), not a testnet.
- Canonical origin: ${SITE_URL}
`;
}