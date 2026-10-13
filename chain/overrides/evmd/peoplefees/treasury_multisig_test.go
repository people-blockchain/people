package peoplefees

import (
	"encoding/hex"
	"testing"

	"github.com/cosmos/evm/crypto/ethsecp256k1"

	kmultisig "github.com/cosmos/cosmos-sdk/crypto/keys/multisig"
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	cryptotypes "github.com/cosmos/cosmos-sdk/crypto/types"
	"github.com/cosmos/cosmos-sdk/types/bech32"
)

// Bech32Prefix mirrors cmd/evmd/config.Bech32Prefix without importing that package (avoids
// pulling in the full app wiring, and the global sdk.Config can only be sealed once per process).
const bech32Prefix = "people"

// treasuryMultisigPubkeysHex must stay byte-for-byte equal to
// chain/emission/allocation.json `treasury_multisig.public_keys_secp256k1_hex` — cross-checked
// textually against allocation.json by validate-emission-genesis.py (CHAIN-M5 part 2).
var treasuryMultisigPubkeysHex = []string{
	"0211f37d541a43e7c6afbfd00e163130563719d817522db5218cc95318e608304b",
	"034388487f8f6e1f66eca64cb0ec1f9ef5755d2816d9ed8d22cd5da756e00e6e6f",
	"02895b4bc696fc47b4133e1cf389cc625dc963ecd0258366799223f2307f38cbe9",
}

const treasuryMultisigThreshold = 2

func mustAddress(t *testing.T, pk cryptotypes.PubKey) string {
	t.Helper()
	addr, err := bech32.ConvertAndEncode(bech32Prefix, pk.Address().Bytes())
	if err != nil {
		t.Fatalf("bech32 encode: %v", err)
	}
	return addr
}

// TestTreasuryMultisigAddressDerivesFromDeclaredEthsecp256k1Pubkeys proves
// TreasuryMultisigAddress (feesplit.go) really is the 2-of-3 LegacyAminoPubKey multisig built
// from the three declared ethsecp256k1 pubkeys — not a typo'd or hand-edited address that nobody
// can actually produce a valid multisig signature for (CHAIN-M5 part 1).
func TestTreasuryMultisigAddressDerivesFromDeclaredEthsecp256k1Pubkeys(t *testing.T) {
	pubkeys := make([]cryptotypes.PubKey, len(treasuryMultisigPubkeysHex))
	for i, h := range treasuryMultisigPubkeysHex {
		key, err := hex.DecodeString(h)
		if err != nil {
			t.Fatalf("decode pubkey %d: %v", i, err)
		}
		pubkeys[i] = &ethsecp256k1.PubKey{Key: key}
	}

	multisigPk := kmultisig.NewLegacyAminoPubKey(treasuryMultisigThreshold, pubkeys)
	got := mustAddress(t, multisigPk)

	if got != TreasuryMultisigAddress {
		t.Fatalf("derived multisig address %s does not match TreasuryMultisigAddress %s", got, TreasuryMultisigAddress)
	}
}

// TestTreasuryMultisigAddressRejectsWrongKeyType proves the key *type* matters: the same hex
// bytes interpreted as plain cosmos secp256k1 (instead of ethsecp256k1) pubkeys produce a
// different address, so a mainnet regeneration that accidentally used the wrong pubkey type
// would be caught by this test (see allocation.json treasury_multisig note / CHAIN-M5).
func TestTreasuryMultisigAddressRejectsWrongKeyType(t *testing.T) {
	pubkeys := make([]cryptotypes.PubKey, len(treasuryMultisigPubkeysHex))
	for i, h := range treasuryMultisigPubkeysHex {
		key, err := hex.DecodeString(h)
		if err != nil {
			t.Fatalf("decode pubkey %d: %v", i, err)
		}
		pubkeys[i] = &secp256k1.PubKey{Key: key}
	}

	multisigPk := kmultisig.NewLegacyAminoPubKey(treasuryMultisigThreshold, pubkeys)
	got := mustAddress(t, multisigPk)

	if got == TreasuryMultisigAddress {
		t.Fatalf("plain secp256k1 pubkeys must NOT derive TreasuryMultisigAddress, but they did: %s", got)
	}
}
