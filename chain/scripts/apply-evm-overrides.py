#!/usr/bin/env python3
"""Apply People's chain overrides onto a pinned cosmos/evm checkout."""
from __future__ import annotations

import sys
from pathlib import Path

BEGIN_OLD = """func (app *EVMD) BeginBlocker(ctx sdk.Context) (sdk.BeginBlock, error) {
\treturn app.ModuleManager.BeginBlock(ctx)
}"""

BEGIN_NEW = """func (app *EVMD) BeginBlocker(ctx sdk.Context) (sdk.BeginBlock, error) {
\tif err := peoplefees.RouteModelAFees(ctx, app.BankKeeper, &app.DistrKeeper, app.StakingKeeper); err != nil {
\t\treturn sdk.BeginBlock{}, err
\t}
\tvalidatorPoolAddr, err := sdk.AccAddressFromBech32(peoplefees.ValidatorPoolAddress)
\tif err != nil {
\t\treturn sdk.BeginBlock{}, err
\t}
\tif err := peoplefees.StreamValidatorPool(ctx, app.BankKeeper, &app.DistrKeeper, app.StakingKeeper, validatorPoolAddr); err != nil {
\t\treturn sdk.BeginBlock{}, err
\t}
\treturn app.ModuleManager.BeginBlock(ctx)
}"""

IMPORT_LINE = '\t"github.com/cosmos/evm/evmd/peoplefees"\n'


def patch_app_go(app_go: Path) -> None:
    text = app_go.read_text()
    if "evmd/peoplefees" not in text:
        anchor = '\t"github.com/cosmos/evm/evmd/ante"\n'
        if anchor not in text:
            raise SystemExit(f"import anchor not found in {app_go}")
        text = text.replace(anchor, anchor + IMPORT_LINE, 1)
    if BEGIN_OLD in text:
        text = text.replace(BEGIN_OLD, BEGIN_NEW, 1)
    elif BEGIN_NEW.split("\n")[0] not in text:
        raise SystemExit("BeginBlocker block not found; upstream app.go changed")
    app_go.write_text(text)


# Mainnet (people_97400-1, EVM 97400) and testnet (people_97401-1, EVM 97401) run the same
# binary. Upstream passes one compile-time EVMChainID everywhere; these patches make every app
# construction derive the EVM chain id from the Cosmos chain-id instead (config.EVMChainIDFor).
# A mainnet node whose app.toml still says another evm-chain-id refuses to start, because the
# JSON-RPC server reports app.toml's value to wallets.
ROOT_REPLACEMENTS = [
    (
        "customAppTemplate, customAppConfig := evmdconfig.InitAppConfig(evmdconfig.BaseDenom, evmdconfig.EVMChainID)",
        "customAppTemplate, customAppConfig := evmdconfig.InitAppConfig(evmdconfig.BaseDenom, evmdconfig.EVMChainIDFor(initClientCtx.ChainID))",
        1,
    ),
    (
        "if err := evmdconfig.EvmAppOptions(evmdconfig.EVMChainID); err != nil {",
        "if err := evmdconfig.EvmAppOptions(evmdconfig.EVMChainIDFor(initClientCtx.ChainID)); err != nil {",
        1,
    ),
    (
        """	return evmd.NewExampleApp(
		logger, db, traceStore, true,
		appOpts,
		evmdconfig.EVMChainID,
		evmdconfig.EvmAppOptions,
		baseappOptions...,
	)""",
        """	evmChainID := evmdconfig.EVMChainIDFor(chainID)
	if chainID == evmdconfig.PeopleMainnetChainID {
		if got := cast.ToUint64(appOpts.Get("evm.evm-chain-id")); got != evmChainID {
			panic(fmt.Sprintf("app.toml [evm] evm-chain-id is %d; %s requires %d", got, chainID, evmChainID))
		}
	}

	return evmd.NewExampleApp(
		logger, db, traceStore, true,
		appOpts,
		evmChainID,
		evmdconfig.EvmAppOptions,
		baseappOptions...,
	)""",
        1,
    ),
    (
        "evmdconfig.EVMChainID, evmdconfig.EvmAppOptions, baseapp.SetChainID(chainID))",
        "evmdconfig.EVMChainIDFor(chainID), evmdconfig.EvmAppOptions, baseapp.SetChainID(chainID))",
        2,
    ),
]

CREATOR_OLD = """		simtestutil.EmptyAppOptions{},
		evmdconfig.EVMChainID,
		evmdconfig.EvmAppOptions,
		baseappOptions...,"""
CREATOR_NEW = """		simtestutil.EmptyAppOptions{},
		evmdconfig.EVMChainIDFor(chainID),
		evmdconfig.EvmAppOptions,
		baseappOptions...,"""


def patch_root_go(root_go: Path) -> None:
    text = root_go.read_text()
    for old, new, count in ROOT_REPLACEMENTS:
        if text.count(new) == count:
            continue
        if text.count(old) != count:
            raise SystemExit(f"{root_go}: expected {count} x {old[:60]!r}; upstream root.go changed")
        text = text.replace(old, new)
    if '\t"fmt"\n' not in text:
        text = text.replace('\t"errors"\n', '\t"errors"\n\t"fmt"\n', 1)
    root_go.write_text(text)


def patch_creator_go(creator_go: Path) -> None:
    text = creator_go.read_text()
    if CREATOR_NEW in text:
        return
    if text.count(CREATOR_OLD) != 1:
        raise SystemExit(f"{creator_go}: newApp anchor not found; upstream creator.go changed")
    creator_go.write_text(text.replace(CREATOR_OLD, CREATOR_NEW, 1))


def main() -> None:
    cache = Path(sys.argv[1])
    patch_app_go(cache / "evmd" / "app.go")
    patch_root_go(cache / "evmd" / "cmd" / "evmd" / "cmd" / "root.go")
    patch_creator_go(cache / "evmd" / "cmd" / "evmd" / "cmd" / "creator.go")


if __name__ == "__main__":
    main()
