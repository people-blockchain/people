package peoplefees

import (
	"testing"

	"cosmossdk.io/math"
)

// EndBalances is the appl credited to each Model A destination after one fee-routing pass.
type EndBalances struct {
	Validators int64
	Community  int64
	Treasury   int64
	Liquidity  int64
	Growth     int64
	Burn       int64
}

// SimulateEndToEndSplit models peoplefees routing `routed` appl from the fee collector,
// then x/distribution AllocateTokens on `feeCollectorRemainder` (community_tax on that amount only).
func SimulateEndToEndSplit(routed int64, communityTax math.LegacyDec, feeCollectorRemainder int64) EndBalances {
	v, c, tr, li, g, b := SplitModelA(math.NewInt(routed))
	out := EndBalances{
		Validators: v.Int64(), Community: c.Int64(), Treasury: tr.Int64(),
		Liquidity: li.Int64(), Growth: g.Int64(), Burn: b.Int64(),
	}

	if feeCollectorRemainder <= 0 || communityTax.IsZero() {
		return out
	}

	commExtra := math.LegacyNewDec(feeCollectorRemainder).MulTruncate(communityTax).TruncateInt().Int64()
	valExtra := feeCollectorRemainder - commExtra
	out.Community += commExtra
	out.Validators += valExtra
	return out
}

func TestEndToEndModelASplitExactWithZeroCommunityTax(t *testing.T) {
	tax := math.LegacyZeroDec()
	for _, total := range []int64{1, 7, 100, 10_000, 1_000_000, 99_999_999} {
		end := SimulateEndToEndSplit(total, tax, 0)
		v, c, tr, li, g, b := SplitModelA(math.NewInt(total))
		want := EndBalances{v.Int64(), c.Int64(), tr.Int64(), li.Int64(), g.Int64(), b.Int64()}
		if end != want {
			t.Fatalf("total=%d end=%+v want %+v", total, end, want)
		}
	}
}

func TestCommunityTaxSkewsValidatorShareOnLeftover(t *testing.T) {
	const total int64 = 10_000
	tax := math.LegacyMustNewDecFromStr("0.25")
	// peoplefees failed to route the 30% validator tranche (still in fee collector).
	valShare := total * BPSValidators / 10_000
	routed := total - valShare
	end := SimulateEndToEndSplit(routed, tax, valShare)
	if end.Validators == 3000 {
		t.Fatalf("validators should not stay at 30%% when community_tax re-splits leftover: %+v", end)
	}
	if end.Community != 2500 {
		t.Fatalf("community should still be 25%% of total: got %d", end.Community)
	}
}

func TestApprovedModelASharesAt10kFees(t *testing.T) {
	const total int64 = 10_000
	end := SimulateEndToEndSplit(total, math.LegacyZeroDec(), 0)
	if end.Validators != 3000 || end.Community != 2500 || end.Treasury != 2000 ||
		end.Liquidity != 1000 || end.Growth != 1500 || end.Burn != 0 {
		t.Fatalf("Model A mismatch: %+v", end)
	}
}
