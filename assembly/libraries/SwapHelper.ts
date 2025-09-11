import { BinHelper, Math512Bits, SCALE_OFFSET } from './';
import { Bin, FeeParameters } from '../structs';
import { SafeMath256 } from './SafeMath';
import { u256 } from 'as-bignum/assembly/integer/u256';
import { Result } from '@massalabs/as-types';
import { IPair } from '../interfaces/IPair';
import {
  LBRouter__BrokenSwapSafetyCheck,
  LBRouter__SwapOverflows,
  LBRouter__TooMuchTokensIn,
  LBRouter__WrongAmounts,
} from './Errors';
import {
  GetAmountsReturn,
  GetSwapInReturn,
  GetSwapOutReturn,
} from '../structs/Returns';
import { u128 } from 'as-bignum/assembly/integer/u128';

/// @notice Helper contract used for calculating swaps, fees and reserves changes
export class SwapHelper {
  /**
   * Returns the swap amounts in the current bin
   * @param bin The bin information
   * @param fp The fee parameters
   * @param activeId The active id of the pair
   * @param swapForY Whether you've swapping token X for token Y (true) or token Y for token X (false)
   * @param amountIn The amount sent by the user
   * @return GetAmountsReturn: amountInToBin (u256), amountOutOfBin (u256), fees (FeesDistribution)
   */
  static getAmounts(
    _bin: Bin,
    _fp: FeeParameters,
    _activeId: u64,
    _swapForY: bool,
    _amountIn: u256,
  ): GetAmountsReturn {
    const _price = BinHelper.getPriceFromId(_activeId, u64(_fp.binStep));

    let _reserve: u256;
    let _maxAmountInToBin: u256;
    if (_swapForY) {
      _reserve = _bin.reserveY;
      _maxAmountInToBin = Math512Bits.shiftDivRoundUp(
        _reserve,
        SCALE_OFFSET,
        _price,
      );
    } else {
      _reserve = _bin.reserveX;
      _maxAmountInToBin = Math512Bits.mulShiftRoundUp(
        _price,
        _reserve,
        SCALE_OFFSET,
      );
    }

    _fp.updateVolatilityAccumulated(_activeId);
    let fees = _fp.getFeeAmountDistribution(
      _fp.getFeeAmount(_maxAmountInToBin),
    );

    let amountInToBin = u256.Zero;
    let amountOutOfBin = u256.Zero;
    if (u256.le(SafeMath256.add(_maxAmountInToBin, fees.total), _amountIn)) {
      amountInToBin = _maxAmountInToBin;
      amountOutOfBin = _reserve;
    } else {
      fees = _fp.getFeeAmountDistribution(_fp.getFeeAmountFrom(_amountIn));
      amountInToBin = SafeMath256.sub(_amountIn, fees.total);
      amountOutOfBin = _swapForY
        ? Math512Bits.mulShiftRoundDown(_price, amountInToBin, SCALE_OFFSET)
        : Math512Bits.shiftDivRoundDown(amountInToBin, SCALE_OFFSET, _price);
      // Safety check in case rounding returns a higher value than expected
      if (amountOutOfBin > _reserve) amountOutOfBin = _reserve;
    }
    return new GetAmountsReturn(amountInToBin, amountOutOfBin, fees);
  }

  /**
   * Simulate a swap in
   * @param _LBPair The address of the LBPair
   * @param _amountOut The amount of token to receive
   * @param _swapForY Whether you swap X for Y (true), or Y for X (false)
   * @return GetSwapInReturn: amountIn, feesIn
   */
  static getSwapIn(
    _pair: IPair,
    _amountOut: u256,
    _swapForY: bool,
    isQuote: bool = false,
  ): Result<GetSwapInReturn> {
    let amountIn = u256.Zero;
    let feesIn = u256.Zero;

    const pair = _pair.getPairInformation();
    if (
      _amountOut.isZero() ||
      (_swapForY ? _amountOut > pair.reserveY : _amountOut > pair.reserveX)
    ) {
      const msg = LBRouter__WrongAmounts(
        _amountOut,
        _swapForY ? pair.reserveY : pair.reserveX,
      );
      if (isQuote) return new Result(new GetSwapInReturn(), msg);
      else assert(false, msg);
    }
    const _fp: FeeParameters = _pair.feeParameters();
    _fp.updateVariableFeeParameters(pair.activeId);

    let _amountOutOfBin = u256.Zero;
    let _amountInWithFees = u256.Zero;
    let _reserve = u256.Zero;

    // eslint-disable-next-line @typescript-eslint/no-constant-condition
    // Performs the actual swap, bin per bin
    // It uses the findFirstNonEmptyBinId function to make sure the bin we're currently looking at
    // has liquidity in it.
    while (true) {
      const r2 = _pair.getBin(pair.activeId);
      _reserve = _swapForY ? r2.reserveY : r2.reserveX;

      const _price = BinHelper.getPriceFromId(pair.activeId, u64(_fp.binStep));
      if (!_reserve.isZero()) {
        _amountOutOfBin = _amountOut >= _reserve ? _reserve : _amountOut;
        const _amountInToBin = _swapForY
          ? Math512Bits.shiftDivRoundUp(_amountOutOfBin, SCALE_OFFSET, _price)
          : Math512Bits.mulShiftRoundUp(_price, _amountOutOfBin, SCALE_OFFSET);

        // We update the fee, but we don't store the new volatility reference, volatility accumulated and indexRef to not penalize traders
        _fp.updateVolatilityAccumulated(pair.activeId);
        const _fee = _fp.getFeeAmount(_amountInToBin);
        _amountInWithFees = SafeMath256.add(_amountInToBin, _fee);

        if (
          SafeMath256.add(_amountInWithFees, _reserve) > u256.from(u128.Max)
        ) {
          const msg = LBRouter__SwapOverflows(pair.activeId);
          if (isQuote) return new Result(new GetSwapInReturn(), msg);
          else assert(false, msg);
        }
        amountIn = SafeMath256.add(amountIn, _amountInWithFees);
        feesIn = SafeMath256.add(feesIn, _fee);
        _amountOut = SafeMath256.sub(_amountOut, _amountOutOfBin);
      }

      if (!_amountOut.isZero()) {
        const r = _pair.findFirstNonEmptyBinId(pair.activeId, _swapForY);
        if (r.isErr()) {
          if (isQuote) return new Result(new GetSwapInReturn(), r.error);
          else assert(false, r.error || '');
        }
        pair.activeId = r.unwrap();
      } else {
        break;
      }
    }

    if (!_amountOut.isZero()) {
      const msg = LBRouter__BrokenSwapSafetyCheck();
      if (isQuote) return new Result(new GetSwapInReturn(), msg);
      else assert(false, msg);
    }

    return new Result(new GetSwapInReturn(amountIn, feesIn));
  }

  /**
   * Simulate a swap out
   * @param _LBPair The address of the LBPair
   * @param _amountIn The amount of token sent
   * @param _swapForY Whether you swap X for Y (true), or Y for X (false)
   * @param isQuote Whether this is a quote or not (will throw or return an error)
   * @return GetSwapOutReturn: amountOut, feesIn
   */
  static getSwapOut(
    _pair: IPair,
    _amountIn: u256,
    _swapForY: bool,
    isQuote: bool = false,
  ): Result<GetSwapOutReturn> {
    let amountOut = u256.Zero;
    let feesIn = u256.Zero;

    const pair = _pair.getPairInformation();
    const _fp: FeeParameters = _pair.feeParameters();
    _fp.updateVariableFeeParameters(pair.activeId);
    let _bin: Bin = new Bin();

    // eslint-disable-next-line @typescript-eslint/no-constant-condition
    // Performs the actual swap, bin per bin
    // It uses the findFirstNonEmptyBinId function to make sure the bin we're currently looking at
    // has liquidity in it.
    while (true) {
      _bin = _pair.getBin(pair.activeId);

      if (!_bin.reserveX.isZero() || !_bin.reserveY.isZero()) {
        const r3 = SwapHelper.getAmounts(
          _bin,
          _fp,
          pair.activeId,
          _swapForY,
          _amountIn,
        );

        if (r3.amountOutOfBin > u256.from(u128.Max)) {
          const msg = LBRouter__SwapOverflows(pair.activeId);
          if (isQuote) return new Result(new GetSwapOutReturn(), msg);
          else assert(false, msg);
        }

        _amountIn = SafeMath256.sub(
          _amountIn,
          SafeMath256.add(r3.amountInToBin, r3.fees.total),
        );
        feesIn = SafeMath256.add(feesIn, r3.fees.total);
        amountOut = SafeMath256.add(amountOut, r3.amountOutOfBin);
      }

      if (!_amountIn.isZero()) {
        const r = _pair.findFirstNonEmptyBinId(pair.activeId, _swapForY);
        if (r.isErr()) {
          if (isQuote) return new Result(new GetSwapOutReturn(), r.error);
          else assert(false, r.error || '');
        }
        pair.activeId = r.unwrap();
      } else {
        break;
      }
    }

    if (!_amountIn.isZero()) {
      const msg = LBRouter__TooMuchTokensIn(_amountIn);
      if (isQuote) return new Result(new GetSwapOutReturn(), msg);
      else assert(false, msg);
    }

    return new Result(new GetSwapOutReturn(amountOut, feesIn));
  }
}
