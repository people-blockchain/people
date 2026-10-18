import { PPL_SCALE, pplToAtoms } from "./ppl-units.js";
import type { CurveState, CurveStatus, LiquidityPoolState, TokenAllocation } from "@people/protocol";

export const VIRTUAL_NATIVE_RESERVE_BASE = 60; // 60 NATIVE
export const CURVE_FEE_BPS = 100; // 1.00% = 100 bps
export const AMM_FEE_BPS = 30; // 0.30% = 30 bps

export interface BuyCalculationResult {
  tokensOut: number;
  fee: number;
  netNativeInput: number;
  newVirtualTokenReserve: number;
  newVirtualNativeReserve: number;
  newActualNativeReserve: number;
  newCurrentTokenReserve: number;
  isMigrationTriggered: boolean;
}

export interface SellCalculationResult {
  netNativeOut: number;
  grossNativeOut: number;
  fee: number;
  newVirtualTokenReserve: number;
  newVirtualNativeReserve: number;
  newActualNativeReserve: number;
  newCurrentTokenReserve: number;
}

export interface MigrationCalculationResult {
  poolNativeReserve: number;
  poolTokenReserve: number;
  tokensFromLiquidityReserve: number;
  tokensFromCurveInventory: number;
  remainingLiquidityReserve: number;
  remainingCurveInventoryToLaunchReserve: number;
  finalSpotPrice: number;
}

export class BondingCurveEngine {
  /**
   * Derive deterministic allocation for a total supply S.
   * Total = 100%:
   * 60% Curve, 10% Community Pool, 15% Creator, 10% Liquidity Reserve, 5% Ecosystem Reserve.
   */
  static calculateTokenAllocation(totalSupply: number): TokenAllocation {
    if (!Number.isSafeInteger(totalSupply) || totalSupply <= 0) {
      throw new Error("Total supply must be a positive safe integer");
    }

    const s = BigInt(totalSupply);
    const communityPool = (s * 10n) / 100n;
    const creator = (s * 15n) / 100n;
    const liquidityReserve = (s * 10n) / 100n;
    const ecosystemReserve = (s * 5n) / 100n;
    const bondingCurve = s - (communityPool + creator + liquidityReserve + ecosystemReserve);

    return {
      bondingCurve: BondingCurveEngine.toSafeInteger(bondingCurve, "bondingCurve"),
      communityPool: BondingCurveEngine.toSafeInteger(communityPool, "communityPool"),
      creator: BondingCurveEngine.toSafeInteger(creator, "creator"),
      liquidityReserve: BondingCurveEngine.toSafeInteger(liquidityReserve, "liquidityReserve"),
      ecosystemReserve: BondingCurveEngine.toSafeInteger(ecosystemReserve, "ecosystemReserve")
    };
  }

  /**
   * Initialize a new CurveState for a token with total supply S.
   */
  static createInitialCurveState(assetId: string, totalSupply: number, microPpl = false): CurveState {
    const allocation = BondingCurveEngine.calculateTokenAllocation(totalSupply);
    return BondingCurveEngine.createCurveStateForAllocation(
      assetId,
      totalSupply,
      allocation.bondingCurve,
      microPpl
    );
  }

  /**
   * Same curve, but with the market inventory stated explicitly instead of derived from the
   * fixed 60% split. Used by the optional creator promo share (`docs/TOKEN-ECONOMY.md` §4a),
   * which carves its share out of the curve portion only, so the curve opens at 55% or 50% of
   * supply. `initialPriceReference` still references total supply, not the curve slice, so a
   * promo launch quotes against the same nominal supply as a launch without one.
   */
  static createCurveStateForAllocation(
    assetId: string,
    totalSupply: number,
    bondingCurveAllocation: number,
    microPpl = false
  ): CurveState {
    if (!Number.isSafeInteger(bondingCurveAllocation) || bondingCurveAllocation <= 0) {
      throw new Error("Bonding curve allocation must be a positive safe integer");
    }
    const allocation = { bondingCurve: bondingCurveAllocation };
    const x0 = BigInt(allocation.bondingCurve);
    const y0 = BigInt(VIRTUAL_NATIVE_RESERVE_BASE * (microPpl ? PPL_SCALE : 1));
    const k = x0 * y0;
    const migrationThreshold = x0 / 3n;

    return {
      ...(microPpl ? { nativeScale: PPL_SCALE } : {}),
      assetId,
      initialCurveAllocation: allocation.bondingCurve,
      currentTokenReserve: allocation.bondingCurve,
      virtualTokenReserve: allocation.bondingCurve,
      virtualNativeReserve: VIRTUAL_NATIVE_RESERVE_BASE,
      actualNativeReserve: 0,
      invariantK: k.toString(),
      initialPriceReference: 100 / totalSupply,
      status: "active",
      migrationThreshold: BondingCurveEngine.toSafeInteger(migrationThreshold, "migrationThreshold")
    };
  }

  /**
   * Execute buy calculation:
   * Y1 = Y + netInput
   * X1 = ceil(K / Y1) with micro-PPL precision; legacy replay uses floor
   * tokensOut = X - X1
   */
  static calculateBuy(
    curve: CurveState,
    nativeAmount: number,
    minTokensOut: number = 0
  ): BuyCalculationResult {
    if (curve.status !== "active") {
      throw new Error("Bonding curve is not active");
    }
    const scale = curve.nativeScale ?? 1;
    if ((scale === 1 ? !Number.isSafeInteger(nativeAmount) : !Number.isFinite(nativeAmount)) || nativeAmount <= 0) {
      throw new Error("Native input amount must be a positive safe integer");
    }

    const nativeInputBig = BigInt(scale === 1 ? nativeAmount : pplToAtoms(nativeAmount));
    const feeNumerator = nativeInputBig * BigInt(CURVE_FEE_BPS);
    const feeBig = scale === 1 ? feeNumerator / 10000n : (feeNumerator + 9999n) / 10000n;
    const netInputBig = nativeInputBig - feeBig;

    if (netInputBig <= 0n) {
      throw new Error("Net native input after fee must be positive");
    }

    const k = BigInt(curve.invariantK);
    const x = BigInt(curve.virtualTokenReserve);
    const y = BigInt(curve.nativeScale ? pplToAtoms(curve.virtualNativeReserve) : curve.virtualNativeReserve);

    const y1 = y + netInputBig;
    const x1 = scale === 1 ? k / y1 : (k + y1 - 1n) / y1; // ceil protects the reserve
    const tokensOutBig = x - x1;

    if (tokensOutBig <= 0n) {
      throw new Error("Native input is insufficient to purchase any tokens");
    }

    const currentTokenReserveBig = BigInt(curve.currentTokenReserve);
    if (tokensOutBig > currentTokenReserveBig) {
      throw new Error("Purchase exceeds available curve token inventory");
    }

    const tokensOut = BondingCurveEngine.toSafeInteger(tokensOutBig, "tokensOut");
    if (tokensOut < minTokensOut) {
      throw new Error(`Slippage limit exceeded: got ${tokensOut}, minimum required ${minTokensOut}`);
    }

    const newCurrentReserveBig = currentTokenReserveBig - tokensOutBig;
    const newActualNativeBig = BigInt(curve.nativeScale ? pplToAtoms(curve.actualNativeReserve) : curve.actualNativeReserve) + netInputBig;

    const migrationThresholdBig = BigInt(curve.migrationThreshold);
    const isMigrationTriggered = newCurrentReserveBig <= migrationThresholdBig;

    return {
      tokensOut,
      fee: BondingCurveEngine.toSafeInteger(feeBig, "fee") / scale,
      netNativeInput: BondingCurveEngine.toSafeInteger(netInputBig, "netNativeInput") / scale,
      newVirtualTokenReserve: BondingCurveEngine.toSafeInteger(x1, "virtualTokenReserve"),
      newVirtualNativeReserve: BondingCurveEngine.toSafeInteger(y1, "virtualNativeReserve") / scale,
      newActualNativeReserve: BondingCurveEngine.toSafeInteger(newActualNativeBig, "actualNativeReserve") / scale,
      newCurrentTokenReserve: BondingCurveEngine.toSafeInteger(newCurrentReserveBig, "currentTokenReserve"),
      isMigrationTriggered
    };
  }

  /**
   * Execute sell calculation:
   * X1 = X + tokenInput
   * Y1 = ceil(K / X1) with micro-PPL precision; legacy replay uses floor
   * grossNativeOut = Y - Y1
   * fee = grossNativeOut * 1%
   * sellerNet = grossNativeOut - fee
   */
  static calculateSell(
    curve: CurveState,
    tokenAmount: number,
    minNativeOut: number = 0
  ): SellCalculationResult {
    if (curve.status !== "active") {
      throw new Error("Bonding curve is not active");
    }
    if (!Number.isSafeInteger(tokenAmount) || tokenAmount <= 0) {
      throw new Error("Token amount must be a positive safe integer");
    }

    const scale = curve.nativeScale ?? 1;
    const tokenInputBig = BigInt(tokenAmount);
    const k = BigInt(curve.invariantK);
    const x = BigInt(curve.virtualTokenReserve);
    const y = BigInt(curve.nativeScale ? pplToAtoms(curve.virtualNativeReserve) : curve.virtualNativeReserve);

    const x1 = x + tokenInputBig;
    const y1 = scale === 1 ? k / x1 : (k + x1 - 1n) / x1;
    const grossNativeOutBig = y - y1;

    if (grossNativeOutBig <= 0n) {
      throw new Error("Token amount produces 0 gross native output");
    }

    const actualNativeReserveBig = BigInt(curve.nativeScale ? pplToAtoms(curve.actualNativeReserve) : curve.actualNativeReserve);
    if (grossNativeOutBig > actualNativeReserveBig) {
      throw new Error("Gross native output exceeds actual curve native reserve");
    }

    const feeNumerator = grossNativeOutBig * BigInt(CURVE_FEE_BPS);
    const feeBig = scale === 1 ? feeNumerator / 10000n : (feeNumerator + 9999n) / 10000n;
    const netNativeOutBig = grossNativeOutBig - feeBig;

    if (netNativeOutBig <= 0n) throw new Error("Token amount produces 0 net native output");
    const netNativeOut = BondingCurveEngine.toSafeInteger(netNativeOutBig, "netNativeOut") / scale;
    if (netNativeOut < minNativeOut) {
      throw new Error(`Slippage limit exceeded: got ${netNativeOut}, minimum required ${minNativeOut}`);
    }

    const newCurrentTokenReserveBig = BigInt(curve.currentTokenReserve) + tokenInputBig;
    const newActualNativeBig = actualNativeReserveBig - grossNativeOutBig;

    return {
      netNativeOut,
      grossNativeOut: BondingCurveEngine.toSafeInteger(grossNativeOutBig, "grossNativeOut") / scale,
      fee: BondingCurveEngine.toSafeInteger(feeBig, "fee") / scale,
      newVirtualTokenReserve: BondingCurveEngine.toSafeInteger(x1, "virtualTokenReserve"),
      newVirtualNativeReserve: BondingCurveEngine.toSafeInteger(y1, "virtualNativeReserve") / scale,
      newActualNativeReserve: BondingCurveEngine.toSafeInteger(newActualNativeBig, "actualNativeReserve") / scale,
      newCurrentTokenReserve: BondingCurveEngine.toSafeInteger(newCurrentTokenReserveBig, "currentTokenReserve")
    };
  }

  /**
   * Calculate migration to AMM Liquidity Pool:
   * poolNative = actualNativeReserve
   * finalSpotPrice = Y_final / X_final
   * poolToken = floor(poolNative * X_final / Y_final)
   * Sources poolToken first from liquidityReserve, then from remaining curve inventory.
   * Residual unsold curve inventory moves to Launch Reserve.
   */
  static calculateMigration(
    curve: CurveState,
    availableLiquidityReserve: number
  ): MigrationCalculationResult {
    const poolNativeBig = BigInt(curve.nativeScale ? pplToAtoms(curve.actualNativeReserve) : curve.actualNativeReserve);
    if (poolNativeBig <= 0n) {
      throw new Error("Cannot migrate curve with zero actual native reserve");
    }

    const xFinal = BigInt(curve.virtualTokenReserve);
    const yFinal = BigInt(curve.nativeScale ? pplToAtoms(curve.virtualNativeReserve) : curve.virtualNativeReserve);

    // Target: poolNative / poolToken = finalSpotPrice = yFinal / xFinal
    // => poolToken = (poolNative * xFinal) / yFinal
    const poolTokenBig = (poolNativeBig * xFinal) / yFinal;

    if (poolTokenBig <= 0n) {
      throw new Error("Calculated pool token reserve is zero");
    }

    const liqReserveBig = BigInt(availableLiquidityReserve);
    let tokensFromLiqBig = 0n;
    let tokensFromCurveBig = 0n;

    if (liqReserveBig >= poolTokenBig) {
      tokensFromLiqBig = poolTokenBig;
    } else {
      tokensFromLiqBig = liqReserveBig;
      tokensFromCurveBig = poolTokenBig - liqReserveBig;
    }

    const curveInventoryBig = BigInt(curve.currentTokenReserve);
    if (tokensFromCurveBig > curveInventoryBig) {
      throw new Error(
        `Insufficient combined liquidity reserve and curve inventory to seed pool: needed ${poolTokenBig.toString()}, available ${(liqReserveBig + curveInventoryBig).toString()}`
      );
    }

    const remainingLiqBig = liqReserveBig - tokensFromLiqBig;
    const remainingCurveInventoryBig = curveInventoryBig - tokensFromCurveBig;

    const scale = curve.nativeScale ?? 1;
    const finalSpotPrice = Number(yFinal) / Number(xFinal) / scale;

    return {
      poolNativeReserve: BondingCurveEngine.toSafeInteger(poolNativeBig, "poolNativeReserve") / scale,
      poolTokenReserve: BondingCurveEngine.toSafeInteger(poolTokenBig, "poolTokenReserve"),
      tokensFromLiquidityReserve: BondingCurveEngine.toSafeInteger(tokensFromLiqBig, "tokensFromLiquidityReserve"),
      tokensFromCurveInventory: BondingCurveEngine.toSafeInteger(tokensFromCurveBig, "tokensFromCurveInventory"),
      remainingLiquidityReserve: BondingCurveEngine.toSafeInteger(remainingLiqBig, "remainingLiquidityReserve"),
      remainingCurveInventoryToLaunchReserve: BondingCurveEngine.toSafeInteger(
        remainingCurveInventoryBig,
        "remainingCurveInventoryToLaunchReserve"
      ),
      finalSpotPrice
    };
  }

  static upgradePrecision(curve: CurveState): void {
    if (curve.nativeScale === PPL_SCALE) return;
    if (curve.nativeScale !== undefined) throw new Error("Unknown curve precision");
    pplToAtoms(curve.virtualNativeReserve);
    pplToAtoms(curve.actualNativeReserve);
    curve.invariantK = (BigInt(curve.invariantK) * BigInt(PPL_SCALE)).toString();
    curve.nativeScale = PPL_SCALE;
  }

  /**
   * Helper to safely convert BigInt to safe JavaScript number or throw.
   */
  static toSafeInteger(val: bigint, fieldName: string): number {
    if (val < 0n) {
      throw new Error(`Negative value not allowed for ${fieldName}: ${val.toString()}`);
    }
    if (val > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        `Value for ${fieldName} (${val.toString()}) exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER})`
      );
    }
    return Number(val);
  }
}
