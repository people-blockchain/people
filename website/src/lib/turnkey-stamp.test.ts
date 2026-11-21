import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertStampedImportActivity,
  buildInitImportActivity,
  buildImportPrivateKeyActivity,
  encodeTurnkeyApiStamp,
  IMPORT_PRIVATE_KEY_TYPE,
  INIT_IMPORT_PRIVATE_KEY_TYPE,
  parseClientStampedActivity,
  parseTurnkeyApiStamp,
} from "./turnkey-stamp.ts";
import { forwardStampedTurnkeyActivity } from "./turnkey-relay.ts";

const org = "11111111-1111-1111-1111-111111111111";
const user = "22222222-2222-2222-2222-222222222222";
const publicKey = "a".repeat(64);
const signature = "b".repeat(128);

describe("client-stamped Turnkey import activities", () => {
  it("builds init/import bodies targeting the sub-org user", () => {
    const init = buildInitImportActivity({ organizationId: org, userId: user, timestampMs: "1" });
    assert.equal(init.type, INIT_IMPORT_PRIVATE_KEY_TYPE);
    assert.equal(init.organizationId, org);
    assert.equal(init.parameters.userId, user);
    const imported = buildImportPrivateKeyActivity({
      organizationId: org,
      userId: user,
      encryptedBundle: "enc-bundle",
      timestampMs: "2",
    });
    assert.equal(imported.type, IMPORT_PRIVATE_KEY_TYPE);
    assert.equal(imported.parameters.userId, user);
    assert.equal(imported.parameters.curve, "CURVE_SECP256K1");
  });

  it("encodes an X-Stamp without embedding a parent API key", () => {
    const stamp = encodeTurnkeyApiStamp({ publicKey, signature });
    const parsed = parseTurnkeyApiStamp(stamp);
    assert.equal(parsed.publicKey, publicKey);
    assert.equal(parsed.signature, signature);
    assert.equal(parsed.scheme, "SIGNATURE_SCHEME_TK_API_P256");
  });

  it("rejects an unstamped import payload so the parent key cannot be used", () => {
    assert.throws(() => parseClientStampedActivity({ encryptedBundle: "secret" }), /client_stamp_required/);
    assert.throws(() => parseClientStampedActivity({}), /client_stamp_required/);
  });

  it("rejects a stamp for a different sub-org or user", () => {
    const body = JSON.stringify(buildInitImportActivity({ organizationId: org, userId: user, timestampMs: "1" }));
    assert.throws(
      () =>
        assertStampedImportActivity(body, {
          type: INIT_IMPORT_PRIVATE_KEY_TYPE,
          organizationId: "other-org",
          userId: user,
        }),
      /turnkey_org_mismatch/,
    );
    assert.throws(
      () =>
        assertStampedImportActivity(body, {
          type: INIT_IMPORT_PRIVATE_KEY_TYPE,
          organizationId: org,
          userId: "other-user",
        }),
      /turnkey_user_mismatch/,
    );
    assert.throws(
      () =>
        assertStampedImportActivity(body, {
          type: IMPORT_PRIVATE_KEY_TYPE,
          organizationId: org,
          userId: user,
        }),
      /invalid_stamp/,
    );
  });

  it("relays the exact stamped body with X-Stamp and never sends a parent API key", async () => {
    const stampedBody = JSON.stringify(
      buildInitImportActivity({ organizationId: org, userId: user, timestampMs: "9" }),
    );
    const stamp = encodeTurnkeyApiStamp({ publicKey, signature });
    const calls: Array<{ url: string; init: { headers: Record<string, string>; body: string } }> = [];
    const payload = await forwardStampedTurnkeyActivity({
      path: "/public/v1/submit/init_import_private_key",
      stamped: { stampedBody, stamp },
      apiBaseUrl: "https://api.turnkey.com",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({ activity: { result: { initImportPrivateKeyResult: { importBundle: "tek" } } } }),
          text: async () => "",
        };
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.turnkey.com/public/v1/submit/init_import_private_key");
    assert.equal(calls[0].init.body, stampedBody);
    assert.equal(calls[0].init.headers["X-Stamp"], stamp);
    assert.equal(calls[0].init.headers.Authorization, undefined);
    assert.equal(calls[0].init.headers["X-Api-Key"], undefined);
    assert.deepEqual(Object.keys(calls[0].init.headers).sort(), ["Accept", "Content-Type", "X-Stamp"]);
    assert.equal(
      (payload as { activity: { result: { initImportPrivateKeyResult: { importBundle: string } } } }).activity.result
        .initImportPrivateKeyResult.importBundle,
      "tek",
    );
  });

  it("surfaces a sanitized Turnkey code when the relayed activity is rejected", async () => {
    const stampedBody = JSON.stringify(
      buildInitImportActivity({ organizationId: org, userId: user, timestampMs: "9" }),
    );
    const stamp = encodeTurnkeyApiStamp({ publicKey, signature });
    await assert.rejects(
      () =>
        forwardStampedTurnkeyActivity({
          path: "/public/v1/submit/init_import_private_key",
          stamped: { stampedBody, stamp },
          apiBaseUrl: "https://api.turnkey.com",
          fetchImpl: async () => ({
            ok: false,
            status: 403,
            json: async () => ({
              code: 7,
              message: "rpc error: code = PermissionDenied desc = not a root user",
            }),
            text: async () => "",
          }),
        }),
      (err: unknown) => {
        assert.equal((err as { turnkeyCode?: string }).turnkeyCode, "PermissionDenied");
        assert.match((err as Error).message, /not a root user/i);
        return true;
      },
    );
  });
});
