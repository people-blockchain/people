package peoplefees

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	distrtypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
)

// StreamValidatorPool pays out whatever has natively unlocked in the validator pool's vesting
// schedule since the last block, split by block-signature participation like the live fee
// share (M11-4), to the validators who actually signed (M11-2 item 3). The genesis schedule
// (chain/scripts/apply-emission-genesis.py) lays the 60/50/50/40M PPL annual tranches out as
// ~365 daily PeriodicVestingAccount periods instead of one cliff per year, so
// bank.SpendableCoins already approximates a continuous per-block stream — this reads that
// natively-computed amount rather than reimplementing vesting math, and drains it to zero every
// time it runs. poolAddr is a regular (non-module) account — nobody holds its private key, by
// design — but this keeper-level code can move its spendable balance without a signature, the
// same way RouteModelAFees already moves fee-collector funds.
func StreamValidatorPool(
	ctx sdk.Context,
	bank bankKeeper,
	distr distrKeeper,
	staking stakingKeeper,
	poolAddr sdk.AccAddress,
) error {
	if ctx.BlockHeight() <= 1 {
		return nil
	}

	toSend := bank.SpendableCoins(ctx, poolAddr).AmountOf(BaseDenom)
	if !toSend.IsPositive() {
		return nil
	}

	signers := signingValidators(ctx, staking)
	if len(signers) == 0 {
		// No signature information yet this block: leave the funds in the pool. The next
		// block that does have signers will catch up (nothing is lost; spendable only grows).
		return nil
	}

	distrModuleAddr := authtypes.NewModuleAddress(distrtypes.ModuleName)
	if err := bank.SendCoins(ctx, poolAddr, distrModuleAddr, sdk.NewCoins(sdk.NewCoin(BaseDenom, toSend))); err != nil {
		return err
	}
	return allocateEqually(ctx, distr, signers, toSend)
}
