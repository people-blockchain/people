// Package peoplefees routes collected gas fees per approved Model A (30/25/20/10/15/0).
package peoplefees

import (
	"context"

	"cosmossdk.io/math"

	comet "cosmossdk.io/core/comet"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	distrkeeper "github.com/cosmos/cosmos-sdk/x/distribution/keeper"
	distrtypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
)

const BaseDenom = "appl"

// Model A fee split in basis points (must sum to 10_000).
const (
	BPSValidators = 3000
	BPSCommunity  = 2500
	BPSTreasury   = 2000
	BPSLiquidity  = 1000
	BPSGrowth     = 1500
	BPSBurn       = 0
)

const (
	ModuleTreasury  = "people_treasury"
	ModuleLiquidity = "people_liquidity"
	ModuleGrowth    = "people_growth"
)

// TreasuryMultisigAddress is the owner-approved 2-of-3 multisig (owner, co-founder, owner's
// cold address) that treasury/liquidity/growth route to directly (M11-2). TESTNET ONLY: the
// 2-of-3 native multisig (test-alex, test-kirill, test-cold) exercised on testnet on 2026-10-08
// (docs/TREASURY-MULTISIG-RU.md). Its keys are test keys on the testnet VPS, so it is NOT
// mainnet custody. The owner must regenerate this with three independently-held keys and
// update this constant (and chain/emission/allocation.json `treasury_multisig`) together
// before mainnet.
const TreasuryMultisigAddress = "people1e9ymgxdtdgszjg7knu0gk9uy2dff8sm4pd0zl2"

// ValidatorPoolAddress is the "validators" bucket account from chain/emission/allocation.json
// (a PeriodicVestingAccount holding 60/50/50/40M PPL across years 1-4; M11-2 item 3).
const ValidatorPoolAddress = "people1yaf2hms6r9z6ws3hk2nmfvn33ruatz6lezml02"

// SplitModelA allocates integer appl fee units; remainder stays with validators (Model A floor rule).
// Amounts are math.Int: appl has 18 decimals, so block fees and stakes exceed int64.
func SplitModelA(total math.Int) (validators, community, treasury, liquidity, growth, burn math.Int) {
	zero := math.ZeroInt()
	if total.IsNil() || !total.IsPositive() {
		return zero, zero, zero, zero, zero, zero
	}
	part := func(bps int64) math.Int { return total.MulRaw(bps).QuoRaw(10_000) }
	community = part(BPSCommunity)
	treasury = part(BPSTreasury)
	liquidity = part(BPSLiquidity)
	growth = part(BPSGrowth)
	burn = part(BPSBurn)
	validators = total.Sub(community).Sub(treasury).Sub(liquidity).Sub(growth).Sub(burn)
	return validators, community, treasury, liquidity, growth, burn
}

type bankKeeper interface {
	GetAllBalances(ctx context.Context, addr sdk.AccAddress) sdk.Coins
	SpendableCoins(ctx context.Context, addr sdk.AccAddress) sdk.Coins
	SendCoinsFromModuleToModule(ctx context.Context, senderModule, recipientModule string, amt sdk.Coins) error
	SendCoins(ctx context.Context, fromAddr, toAddr sdk.AccAddress, amt sdk.Coins) error
}

// stakingKeeper resolves the validator behind a consensus (vote) address — used to attribute
// the live fee share and validator-pool stream to whoever actually signed the previous block
// (M11-4), not to stake weight.
type stakingKeeper interface {
	GetValidatorByConsAddr(ctx context.Context, consAddr sdk.ConsAddress) (stakingtypes.Validator, error)
}

// distrKeeper is the subset of x/distribution used here (satisfied by *distrkeeper.Keeper).
type distrKeeper interface {
	FundCommunityPool(ctx context.Context, amount sdk.Coins, sender sdk.AccAddress) error
	AllocateTokensToValidator(ctx context.Context, val stakingtypes.ValidatorI, tokens sdk.DecCoins) error
}

var _ distrKeeper = (*distrkeeper.Keeper)(nil)

// signingValidators returns the bonded validators whose vote for the previous block (as seen
// by this node in the current block's last-commit) actually counted — i.e. BlockIDFlagCommit,
// not absent/nil. Order follows the comet vote list, which is stable within a given height.
func signingValidators(ctx sdk.Context, staking stakingKeeper) []stakingtypes.ValidatorI {
	info := ctx.CometInfo()
	if info == nil {
		return nil
	}
	commit := info.GetLastCommit()
	if commit == nil {
		return nil
	}
	votes := commit.Votes()
	if votes == nil {
		return nil
	}
	signers := make([]stakingtypes.ValidatorI, 0, votes.Len())
	for i := 0; i < votes.Len(); i++ {
		vote := votes.Get(i)
		if vote.GetBlockIDFlag() != comet.BlockIDFlagCommit {
			continue
		}
		val, err := staking.GetValidatorByConsAddr(ctx, sdk.ConsAddress(vote.Validator().Address()))
		if err != nil {
			continue
		}
		signers = append(signers, val)
	}
	return signers
}

// allocateEqually splits total evenly across signers (remainder to the last), crediting each
// through x/distribution exactly like the existing commission/delegator-reward machinery.
func allocateEqually(ctx context.Context, distr distrKeeper, signers []stakingtypes.ValidatorI, total math.Int) error {
	if !total.IsPositive() || len(signers) == 0 {
		return nil
	}
	n := int64(len(signers))
	share := total.QuoRaw(n)
	remaining := total
	for i, val := range signers {
		amt := share
		if i == len(signers)-1 {
			amt = remaining
		} else {
			remaining = remaining.Sub(share)
		}
		if !amt.IsPositive() {
			continue
		}
		dec := sdk.NewDecCoins(sdk.NewDecCoinFromCoin(sdk.NewCoin(BaseDenom, amt)))
		if err := distr.AllocateTokensToValidator(ctx, val, dec); err != nil {
			return err
		}
	}
	return nil
}

// RouteModelAFees drains the fee collector and routes appl per Model A before x/distribution runs.
// Genesis distribution.community_tax must stay 0: peoplefees already sends 25% to the community pool,
// and any fee-collector remainder would be re-split by x/distribution (skewing the 30% validator share).
func RouteModelAFees(
	ctx sdk.Context,
	bank bankKeeper,
	distr distrKeeper,
	staking stakingKeeper,
) error {
	if ctx.BlockHeight() <= 1 {
		return nil
	}

	feeCollector := authtypes.NewModuleAddress(authtypes.FeeCollectorName)
	fees := bank.GetAllBalances(ctx, feeCollector)
	feeCoin := fees.AmountOf(BaseDenom)
	if !feeCoin.IsPositive() {
		return nil
	}

	valAmt, commAmt, treAmt, liqAmt, growthAmt, _ := SplitModelA(feeCoin)

	multisig, err := sdk.AccAddressFromBech32(TreasuryMultisigAddress)
	if err != nil {
		return err
	}

	sendToMultisig := func(amount math.Int) error {
		if !amount.IsPositive() {
			return nil
		}
		coins := sdk.NewCoins(sdk.NewCoin(BaseDenom, amount))
		return bank.SendCoins(ctx, feeCollector, multisig, coins)
	}

	// M11-2: treasury/liquidity/growth go straight to the owner-approved multisig — not to a
	// module account nobody holds a key for (see docs/M11-2-TREASURY-DESIGN.md).
	if err := sendToMultisig(treAmt); err != nil {
		return err
	}
	if err := sendToMultisig(liqAmt); err != nil {
		return err
	}
	if err := sendToMultisig(growthAmt); err != nil {
		return err
	}

	if commAmt.IsPositive() {
		commCoins := sdk.NewCoins(sdk.NewCoin(BaseDenom, commAmt))
		if err := distr.FundCommunityPool(ctx, commCoins, feeCollector); err != nil {
			return err
		}
	}

	if !valAmt.IsPositive() {
		return nil
	}

	// M11-4: the validator share is split by who actually signed the previous block, not by
	// stake. Resolve signers BEFORE moving funds into the distribution module: if nobody
	// signed, the funds must stay in the fee collector so the community-pool fallback below
	// can actually debit them (AllocateTokensToValidator never runs on this branch).
	signers := signingValidators(ctx, staking)
	if len(signers) == 0 {
		// No signature information yet (or nobody signed): fall back to the community pool,
		// the same spare path routeTradingFee already used when there were no active validators.
		coins := sdk.NewCoins(sdk.NewCoin(BaseDenom, valAmt))
		return distr.FundCommunityPool(ctx, coins, feeCollector)
	}

	valCoins := sdk.NewCoins(sdk.NewCoin(BaseDenom, valAmt))
	if err := bank.SendCoinsFromModuleToModule(ctx, authtypes.FeeCollectorName, distrtypes.ModuleName, valCoins); err != nil {
		return err
	}
	if err := allocateEqually(ctx, distr, signers, valAmt); err != nil {
		return err
	}

	// ensure fee collector appl is fully routed (rounding dust to community)
	dust := bank.GetAllBalances(ctx, feeCollector).AmountOf(BaseDenom)
	if dust.IsPositive() {
		return distr.FundCommunityPool(ctx, sdk.NewCoins(sdk.NewCoin(BaseDenom, dust)), feeCollector)
	}
	return nil
}

// ModuleAccountNames returns module accounts that must exist in genesis auth. people_team and
// people_sale are unaffected by M11-2 (team vesting is handled at genesis; sale is unchanged).
func ModuleAccountNames() []string {
	return []string{ModuleTreasury, ModuleLiquidity, ModuleGrowth}
}

// DefaultGenesisParams mirrors allocation.json for app_state.peoplefees.
func DefaultGenesisParams() map[string]interface{} {
	return map[string]interface{}{
		"params": map[string]interface{}{
			"denom": BaseDenom,
			"fee_split_bps": map[string]int{
				"validators": BPSValidators,
				"community":  BPSCommunity,
				"treasury":   BPSTreasury,
				"liquidity":  BPSLiquidity,
				"growth":     BPSGrowth,
				"burn":       BPSBurn,
			},
			"treasury_multisig_address": TreasuryMultisigAddress,
		},
	}
}

// Ensure distrtypes import is used for documentation cross-reference.
var _ = distrtypes.ModuleName
