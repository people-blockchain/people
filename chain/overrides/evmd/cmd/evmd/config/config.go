package config

import (
	"github.com/cosmos/evm/types"
	evmtypes "github.com/cosmos/evm/x/vm/types"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

const (
	// PeopleEvmChainID is the EIP-155 chain ID for People's Blockchain (97401 = 0x17c79).
	PeopleEvmChainID uint64 = 97401
	// PeopleBaseDenom is the Cosmos base unit (18 decimals); human symbol PPL (documented as aPPL).
	PeopleBaseDenom    = "appl"
	PeopleDisplayDenom = "PPL"
)

// ChainsCoinInfo is a map of the chain id and its corresponding EvmCoinInfo
// that allows initializing the app with different coin info based on the
// chain id
var ChainsCoinInfo = map[uint64]evmtypes.EvmCoinInfo{
	EighteenDecimalsChainID: {
		Denom:         ExampleChainDenom,
		ExtendedDenom: ExampleChainDenom,
		DisplayDenom:  ExampleDisplayDenom,
		Decimals:      evmtypes.EighteenDecimals,
	},
	SixDecimalsChainID: {
		Denom:         "utest",
		ExtendedDenom: "atest",
		DisplayDenom:  "test",
		Decimals:      evmtypes.SixDecimals,
	},
	PeopleEvmChainID: {
		Denom:         PeopleBaseDenom,
		ExtendedDenom: PeopleBaseDenom,
		DisplayDenom:  PeopleDisplayDenom,
		Decimals:      evmtypes.EighteenDecimals,
	},
}

const (
	// Bech32Prefix defines the Bech32 prefix for People's Blockchain Cosmos accounts.
	Bech32Prefix = "people"
	Bech32PrefixAccAddr = Bech32Prefix
	Bech32PrefixAccPub  = Bech32Prefix + sdk.PrefixPublic
	Bech32PrefixValAddr = Bech32Prefix + sdk.PrefixValidator + sdk.PrefixOperator
	Bech32PrefixValPub  = Bech32Prefix + sdk.PrefixValidator + sdk.PrefixOperator + sdk.PrefixPublic
	Bech32PrefixConsAddr = Bech32Prefix + sdk.PrefixValidator + sdk.PrefixConsensus
	Bech32PrefixConsPub  = Bech32Prefix + sdk.PrefixValidator + sdk.PrefixConsensus + sdk.PrefixPublic
	DisplayDenom         = PeopleDisplayDenom
	BaseDenom            = PeopleBaseDenom
	BaseDenomUnit        = 18
	EVMChainID           = PeopleEvmChainID
)

// SetBech32Prefixes sets the global prefixes to be used when serializing addresses and public keys to Bech32 strings.
func SetBech32Prefixes(config *sdk.Config) {
	config.SetBech32PrefixForAccount(Bech32PrefixAccAddr, Bech32PrefixAccPub)
	config.SetBech32PrefixForValidator(Bech32PrefixValAddr, Bech32PrefixValPub)
	config.SetBech32PrefixForConsensusNode(Bech32PrefixConsAddr, Bech32PrefixConsPub)
}

// SetBip44CoinType sets the global coin type to be used in hierarchical deterministic wallets.
func SetBip44CoinType(config *sdk.Config) {
	config.SetCoinType(types.Bip44CoinType)
	config.SetPurpose(sdk.Purpose)
	config.SetFullFundraiserPath(types.BIP44HDPath) //nolint: staticcheck
}
