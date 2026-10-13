package peoplefees

import (
	"testing"

	"cosmossdk.io/math"
)

func TestSplitModelASumsToTotal(t *testing.T) {
	cases := []int64{0, 1, 7, 100, 999, 1_000_000, 10_000_000_000}
	for _, n := range cases {
		total := math.NewInt(n)
		v, c, tr, l, g, b := SplitModelA(total)
		if !v.Add(c).Add(tr).Add(l).Add(g).Add(b).Equal(total) {
			t.Fatalf("total=%s split=%s+%s+%s+%s+%s+%s", total, v, c, tr, l, g, b)
		}
	}
}

func TestSplitModelAApprovedShares(t *testing.T) {
	v, c, tr, l, g, b := SplitModelA(math.NewInt(10_000))
	want := []int64{3000, 2500, 2000, 1000, 1500, 0}
	for i, got := range []math.Int{v, c, tr, l, g, b} {
		if !got.Equal(math.NewInt(want[i])) {
			t.Fatalf("unexpected bps split: %s %s %s %s %s %s", v, c, tr, l, g, b)
		}
	}
}

func TestFeeSplitBPSConstantSum(t *testing.T) {
	sum := BPSValidators + BPSCommunity + BPSTreasury + BPSLiquidity + BPSGrowth + BPSBurn
	if sum != 10_000 {
		t.Fatalf("bps sum=%d", sum)
	}
}
