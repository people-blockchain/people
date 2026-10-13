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


def main() -> None:
    cache = Path(sys.argv[1])
    patch_app_go(cache / "evmd" / "app.go")


if __name__ == "__main__":
    main()
