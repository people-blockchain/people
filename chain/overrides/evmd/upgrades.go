package evmd

import (
	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/cosmos/evm/evmd/peoplefees"
	"github.com/cosmos/evm/evmd/upgrades"
)

// RegisterUpgradeHandlers wires the M11-2 treasury-multisig sweep (see
// docs/PROTOCOL-DECISIONS.md). A fresh genesis never needs it — peoplefees routes
// treasury/liquidity/growth straight to the multisig from height 1 — but an existing network
// upgrading from before M11-2 schedules upgrades.UpgradeNameTreasuryMultisig via the standard
// gov software-upgrade proposal to sweep what already piled up in the old module accounts.
func (app EVMD) RegisterUpgradeHandlers() {
	multisigAddr, err := sdk.AccAddressFromBech32(peoplefees.TreasuryMultisigAddress)
	if err != nil {
		panic(err)
	}
	upgrades.RegisterUpgradeHandler(app.UpgradeKeeper, app.BankKeeper, multisigAddr, app.ModuleManager, app.Configurator())
}
