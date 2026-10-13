package upgrades

import (
	"context"
	"testing"

	"cosmossdk.io/math"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
)

type fakeBank struct {
	balances map[string]sdk.Coins
	sent     map[string]sdk.Coins
}

func (b *fakeBank) GetAllBalances(_ context.Context, addr sdk.AccAddress) sdk.Coins {
	return b.balances[addr.String()]
}

func (b *fakeBank) SendCoinsFromModuleToAccount(_ context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error {
	addr := authtypes.NewModuleAddress(senderModule)
	b.balances[addr.String()] = b.balances[addr.String()].Sub(amt...)
	if b.sent == nil {
		b.sent = map[string]sdk.Coins{}
	}
	b.sent[recipientAddr.String()] = b.sent[recipientAddr.String()].Add(amt...)
	return nil
}

func TestSweepLegacyFeeSinksMovesAllThreeModules(t *testing.T) {
	coin := func(n int64) sdk.Coins { return sdk.NewCoins(sdk.NewCoin("appl", math.NewInt(n))) }
	bank := &fakeBank{balances: map[string]sdk.Coins{
		authtypes.NewModuleAddress("people_treasury").String():  coin(100),
		authtypes.NewModuleAddress("people_liquidity").String(): coin(50),
		authtypes.NewModuleAddress("people_growth").String():    coin(0),
	}}
	multisig := sdk.AccAddress([]byte("multisig-test-address-20by"))

	if err := SweepLegacyFeeSinks(context.Background(), bank, multisig); err != nil {
		t.Fatalf("SweepLegacyFeeSinks: %v", err)
	}

	for _, name := range []string{"people_treasury", "people_liquidity", "people_growth"} {
		if got := bank.balances[authtypes.NewModuleAddress(name).String()]; !got.IsZero() {
			t.Fatalf("%s not drained: %s", name, got)
		}
	}
	if got := bank.sent[multisig.String()]; !got.Equal(coin(150)) {
		t.Fatalf("multisig received %s want %s", got, coin(150))
	}
}

func TestSweepLegacyFeeSinksNoopWhenAlreadyEmpty(t *testing.T) {
	bank := &fakeBank{balances: map[string]sdk.Coins{}}
	multisig := sdk.AccAddress([]byte("multisig-test-address-20by"))
	if err := SweepLegacyFeeSinks(context.Background(), bank, multisig); err != nil {
		t.Fatalf("SweepLegacyFeeSinks: %v", err)
	}
	if len(bank.sent) != 0 {
		t.Fatalf("expected no transfers, got %+v", bank.sent)
	}
}
