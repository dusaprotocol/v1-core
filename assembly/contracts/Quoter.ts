import { Args } from '@massalabs/as-types';
import {
  Address,
  callerHasWriteAccess,
  Storage,
} from '@massalabs/massa-as-sdk';
import { IFactory } from '../interfaces';
import {
  BinHelper,
  Math512Bits,
  PRECISION,
  SafeMath256,
  SCALE_OFFSET,
  SwapHelper,
} from '../libraries';
import { FACTORY } from '../storage/Quoter';
import { u256 } from 'as-bignum/assembly/integer/u256';
import { Quote } from '../structs/Quote';
import { LBQuoter_InvalidLength } from '../libraries/Errors';

// ======================================================== //
// ====                  CONSTRUCTOR                   ==== //
// ======================================================== //

export function constructor(bs: StaticArray<u8>): void {
  assert(callerHasWriteAccess(), 'constructor can only be called once');

  const args = new Args(bs);
  const _factory = new Address(args.nextString().expect('_factory is missing'));
  Storage.set(FACTORY, _factory.toString());
}

// ======================================================== //
// ====                    ENDPOINTS                   ==== //
// ======================================================== //

export function findBestPathFromAmountIn(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _route = args
    .nextSerializableObjectArray<Address>()
    .expect('_route is missing');
  const _amountIn = args.nextU256().expect('_amountIn is missing');
  return _findBestPathFromAmountIn(_route, _amountIn).serialize();
}

export function findBestPathFromAmountOut(
  bs: StaticArray<u8>,
): StaticArray<u8> {
  const args = new Args(bs);
  const _route = args
    .nextSerializableObjectArray<Address>()
    .expect('_route is missing');
  const _amountOut = args.nextU256().expect('_amountOut is missing');
  return _findBestPathFromAmountOut(_route, _amountOut).serialize();
}

/** Finds the best path given a list of tokens and the input amount wanted from the swap
 * @param route List of the tokens to go through
 * @param amountIn Swap amount in
 * @return quote The Quote structure containing the necessary element to perform the swap
 */
function _findBestPathFromAmountIn(_route: Address[], _amountIn: u256): Quote {
  assert(_route.length >= 2, LBQuoter_InvalidLength());

  const quote = new Quote(_route);
  const swapLength = _route.length - 1;
  quote.pairs = new Array<Address>(swapLength).fill(new Address('0'));
  quote.binSteps = new Array<u64>(swapLength);
  quote.fees = new Array<u256>(swapLength).fill(u256.Zero);
  quote.amounts = new Array<u256>(_route.length).fill(u256.Zero);
  quote.virtualAmountsWithoutSlippage = new Array<u256>(_route.length).fill(
    u256.Zero,
  );

  quote.amounts[0] = _amountIn;
  quote.virtualAmountsWithoutSlippage[0] = _amountIn;

  const factory = getFactory();
  for (let i = 0; i < swapLength; i++) {
    const LBPairsAvailable = factory.getAllLBPairs(_route[i], _route[i + 1]);

    if (!(LBPairsAvailable.length > 0 && quote.amounts[i] > u256.Zero))
      continue;

    for (let j = 0; j < LBPairsAvailable.length; j++) {
      if (!LBPairsAvailable[j].ignoredForRouting) {
        const swapForY = LBPairsAvailable[j].pair
          .getTokenY()
          ._origin.equals(_route[i + 1]);

        const r = SwapHelper.getSwapOut(
          LBPairsAvailable[j].pair,
          quote.amounts[i],
          swapForY,
          true,
        );
        if (r.isErr()) continue;

        const swap = r.unwrap();
        if (swap.amountOut > quote.amounts[i + 1]) {
          quote.amounts[i + 1] = swap.amountOut;
          quote.pairs[i] = LBPairsAvailable[j].pair._origin;
          quote.binSteps[i] = LBPairsAvailable[j].binStep;

          // Getting current price
          const pair = LBPairsAvailable[j].pair.getPairInformation();
          quote.virtualAmountsWithoutSlippage[i + 1] = getV2Quote(
            SafeMath256.sub(
              quote.virtualAmountsWithoutSlippage[i],
              swap.feesIn,
            ),
            pair.activeId,
            quote.binSteps[i],
            swapForY,
          );

          // unsafe math is fine as we know that quote.amounts[i] > 0
          quote.fees[i] = u256.div(
            SafeMath256.mul(swap.feesIn, PRECISION),
            quote.amounts[i],
          ); // fee percentage in amountIn
        }
      }
    }
  }

  return quote;
}

/** Finds the best path given a list of tokens and the output amount wanted from the swap
 * @param route List of the tokens to go through
 * @param amountOut Swap amount out
 * @return quote The Quote structure containing the necessary element to perform the swap
 */
function _findBestPathFromAmountOut(
  _route: Address[],
  _amountOut: u256,
): Quote {
  assert(_route.length >= 2, LBQuoter_InvalidLength());

  const quote = new Quote(_route);
  const swapLength = _route.length - 1;
  quote.pairs = new Array<Address>(swapLength).fill(new Address('0'));
  quote.binSteps = new Array<u64>(swapLength);
  quote.fees = new Array<u256>(swapLength).fill(u256.Zero);
  quote.amounts = new Array<u256>(_route.length).fill(u256.Zero);
  quote.virtualAmountsWithoutSlippage = new Array<u256>(_route.length).fill(
    u256.Zero,
  );

  quote.amounts[swapLength] = _amountOut;
  quote.virtualAmountsWithoutSlippage[swapLength] = _amountOut;

  const factory = getFactory();
  for (let i = swapLength; i > 0; i--) {
    const LBPairsAvailable = factory.getAllLBPairs(_route[i - 1], _route[i]);

    if (!(LBPairsAvailable.length > 0 && quote.amounts[i] > u256.Zero))
      continue;

    for (let j = 0; j < LBPairsAvailable.length; j++) {
      if (!LBPairsAvailable[j].ignoredForRouting) {
        const swapForY = LBPairsAvailable[j].pair
          .getTokenY()
          ._origin.equals(_route[i]);

        const r = SwapHelper.getSwapIn(
          LBPairsAvailable[j].pair,
          quote.amounts[i],
          swapForY,
          true,
        );
        if (r.isErr()) continue;

        const swap = r.unwrap();
        if (
          !swap.amountIn.isZero() &&
          (swap.amountIn < quote.amounts[i - 1] ||
            quote.amounts[i - 1].isZero())
        ) {
          quote.amounts[i - 1] = swap.amountIn;
          quote.pairs[i - 1] = LBPairsAvailable[j].pair._origin;
          quote.binSteps[i - 1] = LBPairsAvailable[j].binStep;

          // Getting current price
          const pair = LBPairsAvailable[j].pair.getPairInformation();
          quote.virtualAmountsWithoutSlippage[i - 1] = SafeMath256.add(
            getV2Quote(
              quote.virtualAmountsWithoutSlippage[i],
              pair.activeId,
              quote.binSteps[i - 1],
              !swapForY,
            ),
            swap.feesIn,
          );

          // unsafe math is fine as we know that quote.amounts[i -1] > 0
          quote.fees[i - 1] = u256.div(
            SafeMath256.mul(swap.feesIn, PRECISION),
            quote.amounts[i - 1],
          ); // fee percentage in amountIn
        }
      }
    }
  }

  return quote;
}

// ======================================================== //
// ====                     HELPERS                    ==== //
// ======================================================== //

/** Calculates a quote for a V2 pair
 * @param _amount Amount in to consider
 * @param _activeId Current active Id of the considred pair
 * @param _binStep Bin step of the considered pair
 * @param _swapForY Boolean describing if we are swapping from X to Y or the opposite
 * @return quote Amount Out if _amount was swapped with no slippage and no fees
 */
function getV2Quote(
  _amount: u256,
  _activeId: u64,
  _binStep: u64,
  _swapForY: bool,
): u256 {
  let quote: u256;

  if (_swapForY) {
    const x = BinHelper.getPriceFromId(_activeId, _binStep);
    quote = Math512Bits.mulShiftRoundDown(x, _amount, SCALE_OFFSET);
  } else {
    quote = Math512Bits.shiftDivRoundDown(
      _amount,
      SCALE_OFFSET,
      BinHelper.getPriceFromId(_activeId, _binStep),
    );
  }

  return quote;
}

// ======================================================== //
// ====                     GETTERS                    ==== //
// ======================================================== //

function getFactory(): IFactory {
  const address = new Address(Storage.get(FACTORY));
  return new IFactory(address);
}
