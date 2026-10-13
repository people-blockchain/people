package peoplefees

import (
	"context"
	"fmt"
	"math/big"
	"testing"

	comet "cosmossdk.io/core/comet"
	"cosmossdk.io/math"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
)

// The real binary calls evmdconfig.SetBech32Prefixes before any BeginBlocker runs; these
// isolated unit tests need the same global config so TreasuryMultisigAddress parses.
func init() {
	cfg := sdk.GetConfig()
	cfg.SetBech32PrefixForAccount("people", "peoplepub")
}

// Regression tests for audit M11-1: appl amounts (18 decimals) must never pass through int64.

func ppl(n int64) math.Int {
	return math.NewInt(n).Mul(math.NewIntFromBigInt(new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)))
}

func mustInt(s string) math.Int {
	v, ok := math.NewIntFromString(s)
	if !ok {
		panic(s)
	}
	return v
}

func TestSplitModelALargeTotals(t *testing.T) {
	totals := []math.Int{
		mustInt("1000000000000000"),             // 0.001 PPL (old code overflowed total*bps)
		mustInt("4000000000000000"),             // 0.004 PPL
		mustInt("10000000000000000000"),         // 10 PPL (> MaxInt64)
		mustInt("1000000000000000000000000000"), // 1e27 appl
	}
	bps := []int64{BPSValidators, BPSCommunity, BPSTreasury, BPSLiquidity, BPSGrowth, BPSBurn}
	for _, total := range totals {
		v, c, tr, l, g, b := SplitModelA(total)
		parts := []math.Int{v, c, tr, l, g, b}
		sum := math.ZeroInt()
		for i, p := range parts {
			if p.IsNegative() {
				t.Fatalf("total=%s part %d negative: %s", total, i, p)
			}
			sum = sum.Add(p)
			if i == 0 {
				continue // validators take the remainder
			}
			want := new(big.Int).Quo(new(big.Int).Mul(total.BigInt(), big.NewInt(bps[i])), big.NewInt(10_000))
			if p.BigInt().Cmp(want) != 0 {
				t.Fatalf("total=%s part %d = %s, want floor(total*bps/10000) = %s", total, i, p, want)
			}
		}
		if !sum.Equal(total) {
			t.Fatalf("total=%s sum of parts=%s", total, sum)
		}
		minVal := new(big.Int).Quo(new(big.Int).Mul(total.BigInt(), big.NewInt(BPSValidators)), big.NewInt(10_000))
		if v.BigInt().Cmp(minVal) < 0 {
			t.Fatalf("total=%s validators=%s below floor share %s", total, v, minVal)
		}
	}
}

type fakeLedger struct {
	balances map[string]math.Int
}

func (l *fakeLedger) move(from, to string, amt math.Int) {
	if l.balances[from].LT(amt) {
		panic("insufficient " + from)
	}
	l.balances[from] = l.balances[from].Sub(amt)
	cur, ok := l.balances[to]
	if !ok {
		cur = math.ZeroInt()
	}
	l.balances[to] = cur.Add(amt)
}

type fakeBank struct{ l *fakeLedger }

func (b fakeBank) GetAllBalances(_ context.Context, addr sdk.AccAddress) sdk.Coins {
	key := addrKey(addr)
	amt, ok := b.l.balances[key]
	if !ok {
		return sdk.NewCoins()
	}
	return sdk.NewCoins(sdk.NewCoin(BaseDenom, amt))
}

// SpendableCoins has no vesting lock to model here; these fakes only exercise fee routing,
// where every balance tracked is already a non-vesting module/account bucket.
func (b fakeBank) SpendableCoins(ctx context.Context, addr sdk.AccAddress) sdk.Coins {
	return b.GetAllBalances(ctx, addr)
}

func (b fakeBank) SendCoinsFromModuleToModule(_ context.Context, from, to string, amt sdk.Coins) error {
	b.l.move(from, to, amt.AmountOf(BaseDenom))
	return nil
}

func (b fakeBank) SendCoins(_ context.Context, from, to sdk.AccAddress, amt sdk.Coins) error {
	b.l.move(addrKey(from), addrKey(to), amt.AmountOf(BaseDenom))
	return nil
}

// addrKey maps a module address back to its module name (so the fake ledger can key by name
// like the real module accounts do) or, for the multisig/pool addresses used in tests, by the
// bech32-less raw string — tests only need internal consistency, not real bech32 encoding.
func addrKey(addr sdk.AccAddress) string {
	if addr.Equals(authtypes.NewModuleAddress(authtypes.FeeCollectorName)) {
		return authtypes.FeeCollectorName
	}
	return addr.String()
}

type fakeDistr struct {
	l         *fakeLedger
	allocated map[string]math.Int
}

func (d *fakeDistr) FundCommunityPool(_ context.Context, amt sdk.Coins, _ sdk.AccAddress) error {
	d.l.move(authtypes.FeeCollectorName, "community_pool", amt.AmountOf(BaseDenom))
	return nil
}

func (d *fakeDistr) AllocateTokensToValidator(_ context.Context, val stakingtypes.ValidatorI, tokens sdk.DecCoins) error {
	amt := tokens.AmountOf(BaseDenom).TruncateInt()
	cur, ok := d.allocated[val.GetOperator()]
	if !ok {
		cur = math.ZeroInt()
	}
	d.allocated[val.GetOperator()] = cur.Add(amt)
	return nil
}

type fakeStaking struct{ byConsAddr map[string]stakingtypes.Validator }

func (s fakeStaking) GetValidatorByConsAddr(_ context.Context, consAddr sdk.ConsAddress) (stakingtypes.Validator, error) {
	v, ok := s.byConsAddr[consAddr.String()]
	if !ok {
		return stakingtypes.Validator{}, fmt.Errorf("validator not found for %s", consAddr)
	}
	return v, nil
}

type fakeValidator struct {
	consAddr []byte
}

func (f fakeValidator) Address() []byte { return f.consAddr }
func (f fakeValidator) Power() int64    { return 1 }

type fakeVoteInfo struct {
	val  comet.Validator
	flag comet.BlockIDFlag
}

func (v fakeVoteInfo) Validator() comet.Validator        { return v.val }
func (v fakeVoteInfo) GetBlockIDFlag() comet.BlockIDFlag { return v.flag }

type fakeVoteInfos struct{ votes []comet.VoteInfo }

func (v fakeVoteInfos) Len() int                  { return len(v.votes) }
func (v fakeVoteInfos) Get(i int) comet.VoteInfo { return v.votes[i] }

type fakeCommitInfo struct{ votes []comet.VoteInfo }

func (c fakeCommitInfo) Round() int32            { return 0 }
func (c fakeCommitInfo) Votes() comet.VoteInfos { return fakeVoteInfos{c.votes} }

type fakeBlockInfo struct{ commit comet.CommitInfo }

func (b fakeBlockInfo) GetEvidence() comet.EvidenceList { return nil }
func (b fakeBlockInfo) GetValidatorsHash() []byte       { return nil }
func (b fakeBlockInfo) GetProposerAddress() []byte      { return nil }
func (b fakeBlockInfo) GetLastCommit() comet.CommitInfo { return b.commit }

// withSigners builds a ctx whose CometInfo reports exactly the given consensus addresses as
// having signed (BlockIDFlagCommit) the previous block.
func withSigners(ctx sdk.Context, consAddrs ...[]byte) sdk.Context {
	votes := make([]comet.VoteInfo, 0, len(consAddrs))
	for _, ca := range consAddrs {
		votes = append(votes, fakeVoteInfo{val: fakeValidator{consAddr: ca}, flag: comet.BlockIDFlagCommit})
	}
	return ctx.WithCometInfo(fakeBlockInfo{commit: fakeCommitInfo{votes: votes}})
}

func TestRouteModelAFeesSplitsBySignatureNotStake(t *testing.T) {
	fee := ppl(10) // 1e19 appl > MaxInt64
	ledger := &fakeLedger{balances: map[string]math.Int{authtypes.FeeCollectorName: fee}}
	distr := &fakeDistr{l: ledger, allocated: map[string]math.Int{}}

	consBig := []byte("cons-whale-signed-this-block-001")
	consSmall := []byte("cons-genesis-signed-this-block02")
	staking := fakeStaking{byConsAddr: map[string]stakingtypes.Validator{
		sdk.ConsAddress(consBig).String():   {OperatorAddress: "val-whale", Tokens: ppl(1_000_000_000), Status: stakingtypes.Bonded},
		sdk.ConsAddress(consSmall).String(): {OperatorAddress: "val-genesis", Tokens: ppl(100), Status: stakingtypes.Bonded},
	}}

	ctx := withSigners(sdk.Context{}.WithBlockHeight(2), consBig, consSmall)
	if err := RouteModelAFees(ctx, fakeBank{l: ledger}, distr, staking); err != nil {
		t.Fatalf("RouteModelAFees: %v", err)
	}

	valAmt, commAmt, treAmt, liqAmt, growthAmt, _ := SplitModelA(fee)
	if got := ledger.balances[authtypes.FeeCollectorName]; !got.IsZero() {
		t.Fatalf("fee collector not drained: %s", got)
	}
	multisig, err := sdk.AccAddressFromBech32(TreasuryMultisigAddress)
	if err != nil {
		t.Fatalf("bad multisig address: %v", err)
	}
	for name, want := range map[string]math.Int{
		multisig.String(): treAmt.Add(liqAmt).Add(growthAmt),
		"community_pool":  commAmt,
	} {
		if got := ledger.balances[name]; !got.Equal(want) {
			t.Fatalf("%s got %s want %s", name, got, want)
		}
	}

	allocated := math.ZeroInt()
	for _, a := range distr.allocated {
		allocated = allocated.Add(a)
	}
	if !allocated.Equal(valAmt) {
		t.Fatalf("validators allocated %s want %s", allocated, valAmt)
	}

	// Equal split between the two signers (whale stake must NOT get a bigger share).
	half := valAmt.QuoRaw(2)
	otherHalf := valAmt.Sub(half)
	gotWhale := distr.allocated["val-whale"]
	gotGenesis := distr.allocated["val-genesis"]
	if !((gotWhale.Equal(half) && gotGenesis.Equal(otherHalf)) || (gotWhale.Equal(otherHalf) && gotGenesis.Equal(half))) {
		t.Fatalf("expected an equal split regardless of stake: whale=%s genesis=%s (valAmt=%s)", gotWhale, gotGenesis, valAmt)
	}
	if gotWhale.Equal(valAmt) || gotGenesis.IsZero() {
		t.Fatalf("stake-weighted split leaked through: whale=%s genesis=%s", gotWhale, gotGenesis)
	}
}

func TestRouteModelAFeesNoSignersFallsBackToCommunityPool(t *testing.T) {
	fee := math.NewInt(3)
	ledger := &fakeLedger{balances: map[string]math.Int{authtypes.FeeCollectorName: fee}}
	distr := &fakeDistr{l: ledger, allocated: map[string]math.Int{}}
	staking := fakeStaking{byConsAddr: map[string]stakingtypes.Validator{}}

	if err := RouteModelAFees(sdk.Context{}.WithBlockHeight(2), fakeBank{l: ledger}, distr, staking); err != nil {
		t.Fatalf("RouteModelAFees: %v", err)
	}
	if len(distr.allocated) != 0 {
		t.Fatalf("expected no per-validator allocation without signers: %+v", distr.allocated)
	}
}

func TestStreamValidatorPoolDrainsSpendableToSigners(t *testing.T) {
	poolAddr := sdk.AccAddress([]byte("validator-pool-test-address-20b"))
	spendable := ppl(5)
	ledger := &fakeLedger{balances: map[string]math.Int{poolAddr.String(): spendable}}
	distr := &fakeDistr{l: ledger, allocated: map[string]math.Int{}}

	cons := []byte("cons-only-signer-this-block-0001")
	staking := fakeStaking{byConsAddr: map[string]stakingtypes.Validator{
		sdk.ConsAddress(cons).String(): {OperatorAddress: "val-only", Tokens: ppl(1), Status: stakingtypes.Bonded},
	}}
	ctx := withSigners(sdk.Context{}.WithBlockHeight(2), cons)

	if err := StreamValidatorPool(ctx, fakeBank{l: ledger}, distr, staking, poolAddr); err != nil {
		t.Fatalf("StreamValidatorPool: %v", err)
	}
	if got := ledger.balances[poolAddr.String()]; !got.IsZero() {
		t.Fatalf("pool not drained: %s", got)
	}
	if got := distr.allocated["val-only"]; !got.Equal(spendable) {
		t.Fatalf("validator got %s want %s", got, spendable)
	}
}

func TestStreamValidatorPoolNoSignersLeavesFundsInPlace(t *testing.T) {
	poolAddr := sdk.AccAddress([]byte("validator-pool-test-address-20b"))
	spendable := ppl(5)
	ledger := &fakeLedger{balances: map[string]math.Int{poolAddr.String(): spendable}}
	distr := &fakeDistr{l: ledger, allocated: map[string]math.Int{}}
	staking := fakeStaking{byConsAddr: map[string]stakingtypes.Validator{}}

	if err := StreamValidatorPool(sdk.Context{}.WithBlockHeight(2), fakeBank{l: ledger}, distr, staking, poolAddr); err != nil {
		t.Fatalf("StreamValidatorPool: %v", err)
	}
	if got := ledger.balances[poolAddr.String()]; !got.Equal(spendable) {
		t.Fatalf("pool should be untouched without signers: %s", got)
	}
}
