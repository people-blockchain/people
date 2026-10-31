import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("WalletContext.connectCloud awaits persistWalletSession before resolving", () => {
  // A reload right after a successful sign-in must find the session already written to
  // storage. connectCloud resolving before the write lands is exactly the "logged out after
  // reload" bug (a caller navigates with window.location.replace as soon as it resolves).
  const src = readFileSync(join(root, "src/context/WalletContext.tsx"), "utf8");
  assert.match(src, /connectCloud:\s*\(session: WalletSession\) => Promise<void>/);
  const body = src.match(/const connectCloud = useCallback\(async \(next: WalletSession\) => \{[\s\S]*?\n {2}\}, \[\]\);/);
  assert.ok(body, "connectCloud implementation not found");
  assert.match(body[0], /await commitCloudSession\(\(\) => persistWalletSession\(cloud,/);
  assert.match(body[0], /strict:\s*true/);
  assert.doesNotMatch(body[0], /void persistWalletSession/);
});

test("WalletWeb3AuthSignIn.finishConnect awaits connectCloud before it can resolve and navigate", () => {
  // finishConnect's return value gates navigateAfterSignIn (window.location.replace). If
  // connectCloud is only fired-and-forgotten, the replace can run — and the reload can land —
  // before the session write finishes.
  const src = readFileSync(join(root, "src/components/wallet/WalletWeb3AuthSignIn.tsx"), "utf8");
  const body = src.match(/const finishConnect = useCallback\(\s*async \([\s\S]*?\n {2}\);/);
  assert.ok(body, "finishConnect implementation not found");
  assert.match(body[0], /await connectCloud\(cloud\);/);
  const calls = body[0].match(/connectCloud\(cloud\);/g) ?? [];
  const awaited = body[0].match(/await connectCloud\(cloud\);/g) ?? [];
  assert.equal(calls.length, awaited.length, "every connectCloud(cloud) call in finishConnect must be awaited");
});
