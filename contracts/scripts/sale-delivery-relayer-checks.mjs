// Pure preflight checks for sale-delivery-relayer.mjs, kept in their own module so they can be
// unit-tested without RPCs or keys (node --test scripts/sale-delivery-relayer-checks.test.mjs).

export const PEOPLE_TESTNET_CHAIN_ID = 97401;
export const BASE_MAINNET_CHAIN_ID = 8453;

/**
 * Checks that the Base hub was built for the PEOPLE chain the relayer delivers on.
 *
 * PplCurveHubV2.PEOPLE_CHAIN_ID is a compile-time constant (97400, PEOPLE mainnet), so a Base
 * Sepolia rehearsal hub paired with a distributor on the PEOPLE testnet (97401) can never match.
 * Only for that rehearsal the check may be skipped, and only when ALL of these hold:
 *   - ALLOW_TEST_CHAIN=1,
 *   - the PEOPLE RPC answers the testnet chain id 97401,
 *   - the Base RPC is not Base mainnet (8453).
 * In every other case a mismatch throws.
 *
 * @returns {{ skipped: boolean, warning?: string }}
 */
export function checkHubPeopleChain({ hubPeopleChainId, peopleChain, baseChain, allowTestChain }) {
  const hubPeople = Number(hubPeopleChainId);
  if (hubPeople === Number(peopleChain)) return { skipped: false };
  const rehearsal = allowTestChain === true
    && Number(peopleChain) === PEOPLE_TESTNET_CHAIN_ID
    && Number(baseChain) !== BASE_MAINNET_CHAIN_ID;
  if (!rehearsal) {
    throw new Error(`hub PEOPLE_CHAIN_ID is ${hubPeople}, PEOPLE RPC is ${peopleChain}`);
  }
  return {
    skipped: true,
    warning:
      `REHEARSAL ONLY: hub PEOPLE_CHAIN_ID is ${hubPeople} but PEOPLE RPC is the testnet ${peopleChain}; ` +
      `check skipped because ALLOW_TEST_CHAIN=1 and Base chain ${baseChain} is not Base mainnet. ` +
      "Testnet PPL have no value. NEVER run this configuration for the real sale.",
  };
}
