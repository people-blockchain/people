// Regression tests for audit OPS-H2 (privileged node token must not have a public default).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

test('the production compose profile has no default DEV_API_TOKEN (OPS-H2)', async () => {
  const compose = await read('../docker-compose.prod.yml');
  const match = compose.match(/DEV_API_TOKEN:\s*(\S+)/);
  assert.ok(match, 'the prod profile must set DEV_API_TOKEN');
  // Fail closed: `${DEV_API_TOKEN:?...}` makes compose refuse to start when it is unset.
  // `:-...` would silently fall back to a value that is published in the repo.
  assert.match(
    match[1],
    /^\$\{DEV_API_TOKEN:\?/,
    `DEV_API_TOKEN must be required, not defaulted (got "${match[1]}")`
  );
  assert.ok(
    !/change-me|changeme|placeholder|secret/i.test(compose),
    'prod compose must not carry a placeholder credential'
  );
});

test('the production compose profile does not enable dev endpoints', async () => {
  const compose = await read('../docker-compose.prod.yml');
  assert.ok(!/ALLOW_DEV_ENDPOINTS:\s*"?1"?/.test(compose), 'dev endpoints must stay off in prod');
});

// CHAIN-H1/H2 (audit docs/audit-final/chain.md): a coordinated fork only works if every node
// actually receives the activation height. `.env.node.example` documents the activation
// variables, but compose only passes what its `environment:` block lists — a variable that is
// documented and not forwarded leaves that node on the legacy rules, which forks it away from
// the network at the activation height. PROMO_SHARE_UPGRADE_HEIGHT joins the list for the
// optional creator promo share (docs/protocol-decisions/promo-share.md).
const ACTIVATION_VARS = ['SECURITY_UPGRADE_HEIGHT', 'VALIDATOR_ALLOWLIST', 'CONSENSUS_UPGRADE_1_HEIGHT', 'PROMO_SHARE_UPGRADE_HEIGHT'];

for (const file of ['../docker-compose.yml', '../docker-compose.node.yml']) {
  test(`${file} forwards every coordinated-activation variable to each node service`, async () => {
    const compose = await read(file);
    // Node services are the ones that run the chain binary (they set PEER_ID).
    const services = compose.split(/\n(?=  \w[\w-]*:)/).filter(block => /\n\s+PEER_ID:/.test(block));
    assert.ok(services.length >= 1, `${file} must define at least one node service`);
    for (const service of services) {
      const name = service.trim().split(':')[0];
      for (const key of ACTIVATION_VARS) {
        assert.match(
          service,
          new RegExp(`^\\s+${key}: \\$\\{${key}:-\\}$`, 'm'),
          `${file} service "${name}" must forward ${key} (empty default = not scheduled)`
        );
      }
    }
  });
}

test('the public-node env example documents every coordinated activation', async () => {
  const example = await read('../.env.node.example');
  for (const key of ACTIVATION_VARS) {
    assert.ok(example.includes(key), `.env.node.example must document ${key}`);
  }
});
