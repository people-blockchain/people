// Package upgrades registers the coordinated-upgrade handlers for People's chain.
// See docs/PROTOCOL-DECISIONS.md (M11-2) for the owner-approved economics these implement.
package upgrades

import (
	"context"

	upgradekeeper "cosmossdk.io/x/upgrade/keeper"
	upgradetypes "cosmossdk.io/x/upgrade/types"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/cosmos/cosmos-sdk/types/module"
)

// UpgradeNameTreasuryMultisig is the x/upgrade plan name an operator schedules (via the
// standard gov software-upgrade proposal) to run TreasuryMultisigHandler on an existing
// network. A fresh genesis never accumulates a balance in these module accounts (peoplefees
// routes straight to the multisig from height 1), so it never needs to run this handler.
const UpgradeNameTreasuryMultisig = "v2-treasury-multisig"

// legacyFeeSinkModules held treasury/liquidity/growth's share of live fees before M11-2; no
// private key could ever spend from them (see docs/M11-2-TREASURY-DESIGN.md).
var legacyFeeSinkModules = []string{"people_treasury", "people_liquidity", "people_growth"}

type bankKeeper interface {
	GetAllBalances(ctx context.Context, addr sdk.AccAddress) sdk.Coins
	SendCoinsFromModuleToAccount(ctx context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error
}

// SweepLegacyFeeSinks moves whatever balance is still sitting in the pre-M11-2 treasury/
// liquidity/growth module accounts to multisigAddr. Idempotent: a module account already at
// zero is skipped, so running it twice (or on a fresh chain that never funded them) is a no-op.
func SweepLegacyFeeSinks(ctx context.Context, bank bankKeeper, multisigAddr sdk.AccAddress) error {
	for _, name := range legacyFeeSinkModules {
		addr := authtypes.NewModuleAddress(name)
		balance := bank.GetAllBalances(ctx, addr)
		if balance.IsZero() {
			continue
		}
		if err := bank.SendCoinsFromModuleToAccount(ctx, name, multisigAddr, balance); err != nil {
			return err
		}
	}
	return nil
}

// RegisterUpgradeHandler wires the M11-2 treasury-multisig sweep into the upgrade keeper.
// multisigAddr is the owner-approved 2-of-3 multisig account (config placeholder pre-mainnet;
// see chain/emission/allocation.json `treasury_multisig`). mm/configurator are plumbed through
// so that, if this plan is ever actually scheduled alongside a binary upgrade, module migrations
// still run and the on-chain version map still advances (CHAIN-M6) — on a fresh genesis this
// handler is never scheduled, so mm.RunMigrations is a no-op here regardless.
func RegisterUpgradeHandler(
	upgradeKeeper *upgradekeeper.Keeper,
	bank bankKeeper,
	multisigAddr sdk.AccAddress,
	mm *module.Manager,
	configurator module.Configurator,
) {
	upgradeKeeper.SetUpgradeHandler(
		UpgradeNameTreasuryMultisig,
		func(ctx context.Context, _ upgradetypes.Plan, versionMap module.VersionMap) (module.VersionMap, error) {
			if err := SweepLegacyFeeSinks(ctx, bank, multisigAddr); err != nil {
				return versionMap, err
			}
			return mm.RunMigrations(ctx, configurator, versionMap)
		},
	)
}
