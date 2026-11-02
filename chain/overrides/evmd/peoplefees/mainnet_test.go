package peoplefees

import (
	"errors"
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

// Testnet and local chains must keep routing to the testnet multisig, so the running testnet
// replays its history unchanged with a binary that also knows mainnet.
func TestTreasuryMultisigAddressForTestnet(t *testing.T) {
	for _, id := range []string{"people_97401-1", "people_9000-1", ""} {
		got, err := TreasuryMultisigAddressFor(id)
		if err != nil {
			t.Fatalf("%q: unexpected error %v", id, err)
		}
		if got != TreasuryMultisigAddress {
			t.Fatalf("%q: want testnet multisig %s, got %s", id, TreasuryMultisigAddress, got)
		}
		if err := CheckMainnetConfig(id); err != nil {
			t.Fatalf("%q: CheckMainnetConfig must pass off mainnet, got %v", id, err)
		}
	}
}

// Mainnet must never fall back to the testnet multisig (its keys sit on the testnet VPS).
func TestTreasuryMultisigAddressForMainnet(t *testing.T) {
	got, err := TreasuryMultisigAddressFor(MainnetChainID)
	if MainnetTreasuryMultisigAddress == "" {
		if !errors.Is(err, ErrMainnetTreasuryUnset) {
			t.Fatalf("unset mainnet multisig must fail closed, got addr=%q err=%v", got, err)
		}
		if CheckMainnetConfig(MainnetChainID) == nil {
			t.Fatal("CheckMainnetConfig must fail on mainnet while the multisig is unset")
		}
		return
	}
	if err != nil {
		t.Fatalf("unexpected error %v", err)
	}
	if got == TreasuryMultisigAddress {
		t.Fatal("mainnet multisig must differ from the testnet multisig")
	}
	if got != MainnetTreasuryMultisigAddress {
		t.Fatalf("want %s, got %s", MainnetTreasuryMultisigAddress, got)
	}
}

// A mainnet binary without the mainnet multisig must halt at block 1, before any fee moves.
func TestRouteModelAFeesHaltsMainnetWithoutMultisig(t *testing.T) {
	if MainnetTreasuryMultisigAddress != "" {
		t.Skip("mainnet multisig is set")
	}
	for _, h := range []int64{1, 2} {
		ctx := sdk.Context{}.WithChainID(MainnetChainID).WithBlockHeight(h)
		if err := RouteModelAFees(ctx, nil, nil, nil); !errors.Is(err, ErrMainnetTreasuryUnset) {
			t.Fatalf("height %d: want ErrMainnetTreasuryUnset, got %v", h, err)
		}
	}
	// Testnet at height 1 still returns early with no error and touches nothing.
	if err := RouteModelAFees(sdk.Context{}.WithChainID("people_97401-1").WithBlockHeight(1), nil, nil, nil); err != nil {
		t.Fatalf("testnet height 1: %v", err)
	}
}
