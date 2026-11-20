import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCreateSubOrganizationResult, parseImportedKey } from "./turnkey-server.ts";

describe("Turnkey response parsers", () => {
  it("reads a nested createSubOrganizationResultV7 wallet", () => {
    const parsed = parseCreateSubOrganizationResult({
      activity: {
        result: {
          createSubOrganizationResultV7: {
            subOrganizationId: "sub-org-1",
            rootUserIds: ["tk-user-1"],
            wallet: { walletId: "wallet-1", addresses: ["0xabcDEF0000000000000000000000000000000001"] },
          },
        },
      },
    });
    assert.equal(parsed.subOrganizationId, "sub-org-1");
    assert.equal(parsed.turnkeyUserId, "tk-user-1");
    assert.equal(parsed.walletId, "wallet-1");
    assert.deepEqual(parsed.addresses, ["0xabcDEF0000000000000000000000000000000001"]);
  });

  it("throws when the sub-org id is missing", () => {
    assert.throws(() => parseCreateSubOrganizationResult({ activity: { result: {} } }), /turnkey_suborg_missing/);
  });

  it("reads importPrivateKeyResult addresses", () => {
    const parsed = parseImportedKey({
      activity: {
        result: {
          importPrivateKeyResult: {
            privateKeyId: "pk-1",
            addresses: ["0x1111111111111111111111111111111111111111"],
          },
        },
      },
    });
    assert.equal(parsed.privateKeyId, "pk-1");
    assert.deepEqual(parsed.addresses, ["0x1111111111111111111111111111111111111111"]);
  });
});
