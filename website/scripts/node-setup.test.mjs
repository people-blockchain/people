import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicNodeSetup, resolvePublicNodeSetup } from '../src/lib/node-setup.ts';
import {
  DEFAULT_PUBLIC_NODE_IMAGE,
  DEFAULT_PUBLIC_NODE_NETWORK_URL,
} from '../src/lib/public-node-defaults.ts';

const valid = {
  PUBLIC_NODE_IMAGE: 'ghcr.io/example/people-node@sha256:' + 'a'.repeat(64),
  PUBLIC_NODE_NETWORK_URL: 'https://node.example.com/network',
};

test('public command is gated on an immutable image and safe HTTPS configuration', () => {
  assert.equal(
    publicNodeSetup({
      PUBLIC_NODE_IMAGE: 'ghcr.io/example/people-node:latest',
      PUBLIC_NODE_NETWORK_URL: valid.PUBLIC_NODE_NETWORK_URL,
    }).available,
    false,
  );
  for (const url of [
    'http://node.example.com/network',
    'https://user:pass@node.example.com/network',
    'https://node.example.com/$(bad)',
  ]) {
    assert.equal(publicNodeSetup({ ...valid, PUBLIC_NODE_NETWORK_URL: url }).available, false);
  }
  const result = publicNodeSetup(valid);
  assert.equal(result.available, true);
  assert.match(result.command, /127\.0\.0\.1:4001:4001/);
  assert.doesNotMatch(result.command, /PRIVATE_KEY|--privileged|docker.sock/);
});

test('built-in defaults always expose a docker command', () => {
  const result = resolvePublicNodeSetup();
  assert.equal(result.available, true);
  assert.equal(result.endpoint, DEFAULT_PUBLIC_NODE_NETWORK_URL);
  assert.equal(result.image, DEFAULT_PUBLIC_NODE_IMAGE);
  assert.match(result.command, /people-node-data/);
  assert.match(result.command, /node\.peopleblockchain\.network\/network/);
});
