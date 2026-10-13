//go:build ignore

// derive-treasury-multisig is a one-off tool, not part of the build. It prints a real,
// correctly-derived Cosmos 2-of-3 LegacyAminoPubKey multisig address and the exact genesis
// pub_key JSON for it — run it once per signer-set change, not on every build.
//
// The three seed strings below are PUBLIC and produce a TESTNET-ONLY placeholder: anyone who
// reads this file can recompute the private keys. Before mainnet, the owner must replace the
// seeds (or better, use real securely-generated/offline keys from `peopled keys add
// --multisig=...`) and update chain/emission/allocation.json `treasury_multisig` and
// chain/overrides/evmd/peoplefees/feesplit.go `TreasuryMultisigAddress` together.
//
// Run with: go run chain/scripts/derive-treasury-multisig.go
// (requires network access the first time, to fetch cosmos-sdk into the module cache)
package main

import (
	"crypto/sha256"
	"fmt"

	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	cryptocodec "github.com/cosmos/cosmos-sdk/crypto/codec"
	kmultisig "github.com/cosmos/cosmos-sdk/crypto/keys/multisig"
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	cryptotypes "github.com/cosmos/cosmos-sdk/crypto/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

const bech32Prefix = "people"

// TESTNET-ONLY placeholder seeds — public, not secret. See package doc comment above.
var signerSeeds = []string{
	"treasury-multisig-owner-testnet-placeholder",
	"treasury-multisig-cofounder-testnet-placeholder",
	"treasury-multisig-cold-testnet-placeholder",
}

const threshold = 2

func main() {
	cfg := sdk.GetConfig()
	cfg.SetBech32PrefixForAccount(bech32Prefix, bech32Prefix+"pub")

	pubkeys := make([]cryptotypes.PubKey, 0, len(signerSeeds))
	for _, seed := range signerSeeds {
		h := sha256.Sum256([]byte(seed))
		priv := secp256k1.GenPrivKeyFromSecret(h[:])
		pk := priv.PubKey()
		pubkeys = append(pubkeys, pk)
		fmt.Printf("signer %-55s addr=%s pubkey_hex=%x\n", seed, sdk.AccAddress(pk.Address()).String(), pk.Bytes())
	}

	multi := kmultisig.NewLegacyAminoPubKey(threshold, pubkeys)
	fmt.Println("MULTISIG_ADDRESS", sdk.AccAddress(multi.Address()).String())

	ir := codectypes.NewInterfaceRegistry()
	cryptocodec.RegisterInterfaces(ir)
	cdc := codec.NewProtoCodec(ir)
	anyPubKey, err := codectypes.NewAnyWithValue(multi)
	if err != nil {
		panic(err)
	}
	bz, err := cdc.MarshalJSON(anyPubKey)
	if err != nil {
		panic(err)
	}
	fmt.Println("PUBKEY_JSON", string(bz))
}
