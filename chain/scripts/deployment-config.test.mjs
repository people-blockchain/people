// Regression tests for audit M11-3 (validator RPC surface, keyring defaults, shared key volume).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

test('entrypoint does not expose personal/debug unless JSON_RPC_API asks for them', async () => {
  const entrypoint = await read('../docker/entrypoint.sh');
  const match = entrypoint.match(/JSON_RPC_API="\$\{JSON_RPC_API:-([^}]*)\}"/);
  assert.ok(match, 'entrypoint must define a default JSON_RPC_API');
  const api = match[1].split(',');
  assert.ok(!api.includes('personal'), 'personal must not be on by default');
  assert.ok(!api.includes('debug'), 'debug must not be on by default');
  assert.ok(api.includes('eth'), 'the public EVM API must stay available');
  // The literal list must not be hard-coded anywhere else.
  assert.ok(!/--json-rpc\.api eth,txpool,personal/.test(entrypoint));
});

test('the EVM JSON-RPC API set is not hard-coded with personal/debug in scripts or docs', async () => {
  // Every operator-facing file that shows a --json-rpc.api example must use the safe set.
  for (const rel of [
    'ci-smoke.sh',
    '../README.md',
    '../../docs/EVM-RPC-TESTNET-OPERATOR.md',
    '../../docs/DEVELOPMENT.md',
    '../../docs/PUBLIC-NODE-ONBOARDING.md',
    '../../docs/TESTNET-FAUCET.md'
  ]) {
    const body = await read(rel);
    for (const line of body.split('\n')) {
      if (!/--json-rpc\.api\s+\S/.test(line)) continue;
      assert.ok(!/personal|debug/.test(line), `${rel}: ${line.trim()}`);
    }
  }
});

test('each validator mounts only its own data directory', async () => {
  const compose = await read('../docker-compose.yml');
  assert.ok(!/- \.\/\.testnets:\/data\b/.test(compose), 'one shared /data mount exposes every validator key');
  for (const n of [0, 1, 2]) {
    assert.ok(
      compose.includes(`- ./.testnets/node${n}:/data/node${n}`),
      `node${n} must mount its own directory`
    );
  }
});

test('the upstream checkout is pinned to a commit, not just a tag (M11-6)', async () => {
  const commit = (await read('../COSMOS_EVM_COMMIT')).trim();
  assert.match(commit, /^[0-9a-f]{40}$/, 'COSMOS_EVM_COMMIT must hold a full commit SHA');
  const build = await read('build-peopled.sh');
  assert.ok(/COMMIT=.*COSMOS_EVM_COMMIT/.test(build), 'the build must read the pinned commit');
  assert.ok(
    /git rev-parse HEAD/.test(build) && /\$ACTUAL"? != "\$COMMIT/.test(build),
    'the build must compare the checked-out commit with the pin'
  );
  assert.ok(/git reset --hard/.test(build), 'a stale cache must be reset before verification');
  // The tag itself must still be pinned in COSMOS_EVM_VERSION.
  assert.match((await read('../COSMOS_EVM_VERSION')).trim(), /^v[\d.]+/);
});

test('every override is asserted after it is applied (M11-6)', async () => {
  const build = await read('build-peopled.sh');
  for (const needle of ['const TEST_DENOM = "appl"', 'RouteModelAFees', 'evmd/peoplefees']) {
    assert.ok(
      new RegExp(`assert_patched '${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(build),
      `override "${needle}" must be asserted`
    );
  }
  // The docker build context must carry the pin file, or the image build cannot verify it.
  const dockerfile = await read('../Dockerfile');
  assert.ok(dockerfile.includes('COPY COSMOS_EVM_COMMIT COSMOS_EVM_COMMIT'));
});

test('init-testnet always passes an explicit, validated keyring backend', async () => {
  const init = await read('init-testnet.sh');
  assert.ok(/KEYRING_BACKEND="\$\{KEYRING_BACKEND:-test\}"/.test(init));
  assert.ok(/--keyring-backend "\$KEYRING_BACKEND"/.test(init), 'the backend must come from the variable');
  assert.ok(!/--keyring-backend test\b/.test(init), 'the backend must not be hard-coded');
  assert.ok(/test\|file\|os/.test(init), 'unknown backends must be rejected');
});
