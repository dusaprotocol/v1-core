import { Args, u256ToBytes } from '@massalabs/as-types';
import {
  Address,
  balance,
  balanceOf,
  callerHasWriteAccess,
  Context,
  Storage,
  transferCoins,
} from '@massalabs/massa-as-sdk/assembly/index';
import { IERC20, IFactory, IPair, IWMAS } from '../interfaces';
import { LiquidityParameters } from '../structs';
import {
  SafeMath,
  SafeMath256,
  SwapHelper,
  transferRemaining,
} from '../libraries';
import { FACTORY, WMAS } from '../storage/Router';
import {
  LBRouter__AmountSlippageCaught,
  LBRouter__DeadlineExceeded,
  LBRouter__IdDesiredOverflows,
  LBRouter__IdOverflows,
  LBRouter__IdSlippageCaught,
  LBRouter__InsufficientAmountOut,
  LBRouter__InvalidTokenPath,
  LBRouter__LengthsMismatch,
  LBRouter__MaxAmountInExceeded,
  LBRouter__NotFactoryOwner,
  LBRouter__WrongMasLiquidityParameters,
  LBRouter__WrongTokenOrder,
} from '../libraries/Errors';
import { Amounts } from '../structs/Returns';
import { u256 } from 'as-bignum/assembly/integer/u256';

// ======================================================== //
// ====                  CONSTRUCTOR                   ==== //
// ======================================================== //

export function constructor(bs: StaticArray<u8>): void {
  // This line is important. It ensures that this function can't be called in the future.
  // If you remove this check, someone could call your constructor function and reset your smart contract.
  assert(callerHasWriteAccess(), 'constructor can only be called once');

  const args = new Args(bs);

  const wmas = new Address(args.nextString().expect('failed to get wmas'));
  Storage.set(WMAS, wmas.toString());

  const factory = new Address(
    args.nextString().expect('failed to get factory'),
  );
  Storage.set(FACTORY, factory.toString());
}

// ======================================================== //
// ====                PUBLIC ENDPOINTS                ==== //
// ======================================================== //

/**
 * Create a liquidity bin LBPair for _tokenX and _tokenY using the factory
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - _tokenX: Address of the first token
 * - _tokenY: Address of the second token4
 * - _activeId: The activeId of the pair
 * - _binStep: The binStep of the pair
 * @return {StaticArray<u8>} - Byte string containing the address of the newly created LBPair
 */
export function createLBPair(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const tokenX = new Address(args.nextString().expect('tokenX is missing'));
  const tokenY = new Address(args.nextString().expect('tokenY is missing'));
  const activeId = args.nextU32().expect('activeId is missing');
  const binStep = args.nextU32().expect('binStep is missing');

  const factory = getFactory();
  const pair = factory.createLBPair(tokenX, tokenY, activeId, binStep, sent);

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return pair.serialize();
}

/**
 * Add liquidity while performing safety checks
 * This function is compliant with fee on transfer tokens
 *
 * @param {StaticArray<u8>} bs - Byte string containing The liquidity parameters
 * @return {StaticArray<u8>} - Byte string containing:
 * - liquidityMinted: Amounts of LBToken minted for each bin
 * - depositIds: Bin ids where the liquidity was actually deposited
 */
export function addLiquidity(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const _liquidityParameters = new Args(bs)
    .nextSerializable<LiquidityParameters>()
    .expect('LiquidityParameters is missing');

  _ensure(_liquidityParameters.deadline);

  const _LBPair: IPair = _getLBPairInformation(
    _liquidityParameters.tokenX,
    _liquidityParameters.tokenY,
    _liquidityParameters.binStep,
  );
  assert(
    _liquidityParameters.tokenX.equals(_LBPair.getTokenX()),
    LBRouter__WrongTokenOrder(),
  );

  if (!_liquidityParameters.amountX.isZero())
    _liquidityParameters.tokenX.transferFrom(
      Context.caller(),
      _LBPair._origin,
      _liquidityParameters.amountX,
    );
  if (!_liquidityParameters.amountY.isZero())
    _liquidityParameters.tokenY.transferFrom(
      Context.caller(),
      _LBPair._origin,
      _liquidityParameters.amountY,
    );

  const res = _addLiquidity(_liquidityParameters, _LBPair);

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return res;
}

/**
 * Add liquidity with MAS while performing safety checks
 * This function is compliant with fee on transfer tokens
 *
 * @param {StaticArray<u8>} bs - Byte string containing
 * - The liquidity parameters
 * - The amount of MAS to send for storage fees
 * @return {StaticArray<u8>} - Byte string containing:
 * - liquidityMinted: Amounts of LBToken minted for each bin
 * - depositIds: Bin ids where the liquidity was actually deposited
 */
export function addLiquidityMAS(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);

  const _liquidityParameters = args
    .nextSerializable<LiquidityParameters>()
    .expect('LiquidityParameters is missing');
  const masToSend = args.nextU64().expect('masToSend is missing');

  _ensure(_liquidityParameters.deadline);

  const _LBPair: IPair = _getLBPairInformation(
    _liquidityParameters.tokenX,
    _liquidityParameters.tokenY,
    _liquidityParameters.binStep,
  );
  assert(
    _liquidityParameters.tokenX.equals(_LBPair.getTokenX()),
    LBRouter__WrongTokenOrder(),
  );

  const sender = Context.caller();
  // substract the amount of MAS used for storage fees
  const value = SafeMath.sub(sent, masToSend);
  const wmas = getWMAS();
  if (
    _liquidityParameters.tokenX._origin.equals(wmas) &&
    _liquidityParameters.amountX.toU64() == value
  ) {
    _wmasDepositAndTransfer(_LBPair._origin, value);
    if (!_liquidityParameters.amountY.isZero())
      _liquidityParameters.tokenY.transferFrom(
        sender,
        _LBPair._origin,
        _liquidityParameters.amountY,
      );
  } else if (
    _liquidityParameters.tokenY._origin.equals(wmas) &&
    _liquidityParameters.amountY.toU64() == value
  ) {
    if (!_liquidityParameters.amountX.isZero())
      _liquidityParameters.tokenX.transferFrom(
        sender,
        _LBPair._origin,
        _liquidityParameters.amountX,
      );
    _wmasDepositAndTransfer(_LBPair._origin, value);
  } else
    assert(
      false,
      LBRouter__WrongMasLiquidityParameters(
        _liquidityParameters.tokenX._origin,
        _liquidityParameters.tokenY._origin,
        _liquidityParameters.amountX,
        _liquidityParameters.amountY,
        value,
      ),
    );

  const res = _addLiquidity(_liquidityParameters, _LBPair);

  transferRemaining(SCBalance, balance(), sent, Context.caller());
  return res;
}

/**
 * Remove liquidity while performing safety checks
 * This function is compliant with fee on transfer tokens
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - _tokenX: Address of the first token
 * - _tokenY: Address of the second token
 * - _binStep: The binStep of the pair
 * - _amountXMin: The minimum amount of tokenX to receive
 * - _amountYMin: The minimum amount of tokenY to receive
 * - _ids: The list of bin ids
 * - _amounts: The list of amounts to remove
 * - _to: The address of the recipient
 * - deadline: The deadline timestamp
 * @return {StaticArray<u8>} - Byte string containing:
 * - amountX: The amount of tokenX received
 * - amountY: The amount of tokenY received
 */
export function removeLiquidity(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const _tokenX = new IERC20(
    new Address(args.nextString().expect('_tokenX is missing')),
  );
  const _tokenY = new IERC20(
    new Address(args.nextString().expect('_tokenY is missing')),
  );
  const _binStep = u64(args.nextU32().expect('_binStep is missing'));
  let _amountXMin = args.nextU256().expect('_amountXMin is missing');
  let _amountYMin = args.nextU256().expect('_amountYMin is missing');
  const _ids = args.nextFixedSizeArray<u64>().expect('_ids is missing');
  const _amounts: u256[] = args
    .nextFixedSizeArray<u256>()
    .expect('_amounts is missing');
  const _to = new Address(args.nextString().expect('_to is missing'));
  const deadline = args.nextU64().expect('deadline is missing');

  _ensure(deadline);

  const _LBPair = _getLBPairInformation(_tokenX, _tokenY, _binStep);
  const _isWrongOrder = _tokenX.notEqual(_LBPair.getTokenX());
  if (_isWrongOrder) {
    const tmp = _amountXMin;
    _amountXMin = _amountYMin;
    _amountYMin = tmp;
  }
  const r = _removeLiquidity(
    _LBPair,
    _amountXMin,
    _amountYMin,
    _ids,
    _amounts,
    _to,
  );
  if (_isWrongOrder) {
    const tmp = r.amountX;
    r.amountX = r.amountY;
    r.amountY = tmp;
  }

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return new Args().add(r.amountX).add(r.amountY).serialize();
}

/**
 * Remove liquidity with MAS while performing safety checks
 * This function is compliant with fee on transfer tokens
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - _tokenX: Address of the first token
 * - _tokenY: Address of the second token
 * - _binStep: The binStep of the pair
 * - _amountXMin: The minimum amount of tokenX to receive
 * - _amountYMin: The minimum amount of tokenY to receive
 * - _ids: The list of bin ids
 * - _amounts: The list of amounts to remove
 * - _to: The address of the recipient
 * - deadline: The deadline timestamp
 * @return {StaticArray<u8>} - Byte string containing:
 * - amountX: The amount of tokenX received
 * - amountY: The amount of tokenY received
 */
export function removeLiquidityMAS(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const _token = new IERC20(
    new Address(args.nextString().expect('_token is missing')),
  );
  const _binStep = args.nextU32().expect('_binStep is missing');
  const _amountTokenMin = args.nextU256().expect('_amountTokenMin is missing');
  const _amountMASMin = args.nextU256().expect('_amountMASMin is missing');
  const _ids: u64[] = args.nextFixedSizeArray<u64>().expect('_ids is missing');
  const _amounts: u256[] = args
    .nextFixedSizeArray<u256>()
    .expect('_amounts is missing');
  const _to = new Address(args.nextString().expect('_to is missing'));
  const deadline = args.nextU64().expect('deadline is missing');

  _ensure(deadline);

  const wmas = getWMAS();
  const _LBPair = _getLBPairInformation(_token, new IERC20(wmas), _binStep);
  const isMASTokenY = wmas.equals(_LBPair.getTokenY()._origin);

  const r = _removeLiquidity(
    _LBPair,
    isMASTokenY ? _amountTokenMin : _amountMASMin,
    isMASTokenY ? _amountMASMin : _amountTokenMin,
    _ids,
    _amounts,
    Context.callee(),
  );
  const amountToken = isMASTokenY ? r.amountX : r.amountY;
  const amountMAS = isMASTokenY ? r.amountY.toU64() : r.amountX.toU64();

  _token.transfer(_to, amountToken);
  new IWMAS(wmas).withdraw(amountMAS, _to);

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return new Args().add(r.amountX).add(r.amountY).serialize();
}

/**
 * Swap tokens while performing safety checks
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - amountIn: The amount of token to swap
 * - amountOutMin: The minimum amount of token to receive
 * - pairBinSteps: The bin steps of the pairs
 * - tokenPath: The swap path using the bin steps following `_pairBinSteps`
 * - to: The address of the recipient
 * - deadline: The deadline timestamp
 * @return {StaticArray<u8>} - Byte string containing Output amount of the swap
 */
export function swapExactTokensForTokens(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const amountIn = args.nextU256().expect('amountIn is missing');
  const amountOutMin = args.nextU256().expect('amountOutMin is missing');
  const pairBinSteps = args
    .nextFixedSizeArray<u64>()
    .expect('pairBinSteps is missing');
  const tokenPath = args
    .nextSerializableObjectArray<IERC20>()
    .expect('tokenPath is missing');
  const to = new Address(args.nextString().expect('to is missing'));
  const deadline = args.nextU64().expect('deadline is missing');

  _ensure(deadline);
  _verifyInputs(pairBinSteps, tokenPath);

  const pairs = _getPairs(pairBinSteps, tokenPath);

  tokenPath[0].transferFrom(Context.caller(), pairs[0], amountIn);

  const amountOut = _swapExactTokensForTokens(pairs, tokenPath, to);
  assert(
    amountOut >= amountOutMin,
    LBRouter__InsufficientAmountOut(amountOutMin, amountOut),
  );

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return u256ToBytes(amountOut);
}

/**
 * Swaps exact tokens for MAS while performing safety checks
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - amountIn: The amount of token to swap
 * - amountOutMinMAS: The minimum amount of MAS to receive
 * - pairBinSteps: The bin steps of the pairs
 * - tokenPath: The swap path using the bin steps following `_pairBinSteps`
 * - to: The address of the recipient
 * - deadline: The deadline timestamp
 * @return {StaticArray<u8>} - Byte string containing Output amount of the swap
 */
export function swapExactTokensForMAS(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const amountIn = args.nextU256().expect('amountIn is missing');
  const amountOutMinMAS = args.nextU256().expect('amountOutMinMAS is missing');
  const pairBinSteps = args
    .nextFixedSizeArray<u64>()
    .expect('pairBinSteps is missing');
  const tokenPath = args
    .nextSerializableObjectArray<IERC20>()
    .expect('tokenPath is missing');
  const to = new Address(args.nextString().expect('to is missing'));
  const deadline = args.nextU64().expect('deadline is missing');

  _ensure(deadline);
  _verifyInputs(pairBinSteps, tokenPath);

  const wmas = getWMAS();
  assert(
    tokenPath[pairBinSteps.length]._origin.equals(wmas),
    LBRouter__InvalidTokenPath(tokenPath[pairBinSteps.length]._origin),
  );

  const pairs = _getPairs(pairBinSteps, tokenPath);

  tokenPath[0].transferFrom(Context.caller(), pairs[0], amountIn);

  const amountOut = _swapExactTokensForTokens(
    pairs,
    tokenPath,
    Context.callee(),
  );
  assert(
    amountOut >= amountOutMinMAS,
    LBRouter__InsufficientAmountOut(
      u256.from(amountOutMinMAS),
      u256.from(amountOut),
    ),
  );

  new IWMAS(wmas).withdraw(amountOut.toU64(), to);

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return u256ToBytes(amountOut);
}

/**
 * Swaps exact MAS for tokens while performing safety checks
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - amountOutMin: The minimum amount of token to receive
 * - pairBinSteps: The bin steps of the pairs
 * - tokenPath: The swap path using the bin steps following `_pairBinSteps`
 * - to: The address of the recipient
 * - deadline: The deadline timestamp
 * - masToSend: The amount of MAS to send for storage fees
 * @return {StaticArray<u8>} - Byte string containing Output amount of the swap
 */
export function swapExactMASForTokens(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const amountOutMin = args.nextU256().expect('amountOutMin is missing');
  const pairBinSteps = args
    .nextFixedSizeArray<u64>()
    .expect('pairBinSteps is missing');
  const tokenPath = args
    .nextSerializableObjectArray<IERC20>()
    .expect('tokenPath is missing');
  const to = new Address(args.nextString().expect('to is missing'));
  const deadline = args.nextU64().expect('deadline is missing');
  const masToSend = args.nextU64().expect('masToSend is missing');

  _ensure(deadline);
  _verifyInputs(pairBinSteps, tokenPath);

  // substract the amount of MAS used for storage fees
  const value = SafeMath.sub(sent, masToSend);
  const wmas = getWMAS();
  assert(
    tokenPath[0]._origin.equals(wmas),
    LBRouter__InvalidTokenPath(tokenPath[0]._origin),
  );

  const pairs = _getPairs(pairBinSteps, tokenPath);

  _wmasDepositAndTransfer(pairs[0], value);

  const amountOut = _swapExactTokensForTokens(pairs, tokenPath, to);
  assert(
    amountOut >= amountOutMin,
    LBRouter__InsufficientAmountOut(amountOutMin, amountOut),
  );

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return u256ToBytes(amountOut);
}

/**
 * Swaps tokens for exact tokens while performing safety checks
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - amountOut: The amount of token to receive
 * - amountInMax: The maximum amount of token to send
 * - pairBinSteps: The bin steps of the pairs
 * - tokenPath: The swap path using the bin steps following `_pairBinSteps`
 * - to: The address of the recipient
 * - deadline: The deadline timestamp
 * @return {StaticArray<u8>} - Byte string containing the output amount of the swap
 */
export function swapTokensForExactTokens(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const amountOut = args.nextU256().expect('amountOut is missing');
  const amountInMax = args.nextU256().expect('amountInMax is missing');
  const pairBinSteps = args
    .nextFixedSizeArray<u64>()
    .expect('pairBinSteps is missing');
  const tokenPath = args
    .nextSerializableObjectArray<IERC20>()
    .expect('tokenPath is missing');
  const to = new Address(args.nextString().expect('to is missing'));
  const deadline = args.nextU64().expect('deadline is missing');

  _ensure(deadline);
  _verifyInputs(pairBinSteps, tokenPath);

  const pairs = _getPairs(pairBinSteps, tokenPath);
  const amountsIn = _getAmountsIn(pairs, tokenPath, amountOut);

  assert(
    amountsIn[0] <= amountInMax,
    LBRouter__MaxAmountInExceeded(amountInMax, amountsIn[0]),
  );

  tokenPath[0].transferFrom(Context.caller(), pairs[0], amountsIn[0]);

  const amountOutReal = _swapExactTokensForTokens(pairs, tokenPath, to);
  assert(
    amountOutReal >= amountOut,
    LBRouter__InsufficientAmountOut(amountOut, amountOutReal),
  );

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return u256ToBytes(amountOut);
}

/**
 * Swaps tokens for exact MAS while performing safety checks
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - amountOut: The amount of MAS to receive
 * - amountInMax: The maximum amount of token to send
 * - pairBinSteps: The bin steps of the pairs
 * - tokenPath: The swap path using the bin steps following `_pairBinSteps`
 * - to: The address of the recipient
 * - deadline: The deadline timestamp
 * @return {StaticArray<u8>} - Byte string containing the output amount of the swap
 */
export function swapTokensForExactMAS(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const amountOut = args.nextU256().expect('amountOut is missing');
  const amountInMax = args.nextU256().expect('amountInMax is missing');
  const pairBinSteps = args
    .nextFixedSizeArray<u64>()
    .expect('pairBinSteps is missing');
  const tokenPath = args
    .nextSerializableObjectArray<IERC20>()
    .expect('tokenPath is missing');
  const to = new Address(args.nextString().expect('to is missing'));
  const deadline = args.nextU64().expect('deadline is missing');

  _ensure(deadline);
  _verifyInputs(pairBinSteps, tokenPath);

  const wmas = getWMAS();
  assert(
    tokenPath[pairBinSteps.length]._origin.equals(wmas),
    LBRouter__InvalidTokenPath(tokenPath[pairBinSteps.length]._origin),
  );

  const pairs = _getPairs(pairBinSteps, tokenPath);
  const amountsIn = _getAmountsIn(pairs, tokenPath, u256.from(amountOut));

  assert(
    amountsIn[0] <= amountInMax,
    LBRouter__MaxAmountInExceeded(amountInMax, amountsIn[0]),
  );

  tokenPath[0].transferFrom(Context.caller(), pairs[0], amountsIn[0]);

  const amountOutReal = _swapTokensForExactTokens(
    pairs,
    tokenPath,
    Context.callee(),
  );
  assert(
    amountOutReal >= amountOut,
    LBRouter__InsufficientAmountOut(amountOut, amountOutReal),
  );

  new IWMAS(wmas).withdraw(amountOutReal.toU64(), to);

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return u256ToBytes(amountOut);
}

/**
 * Swaps MAS for exact tokens while performing safety checks
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - amountOut: The amount of token to receive
 * - pairBinSteps: The bin steps of the pairs
 * - tokenPath: The swap path using the bin steps following `_pairBinSteps`
 * - to: The address of the recipient
 * - deadline: The deadline timestamp
 * - masToSend: The amount of MAS to send for storage fees
 * @return {StaticArray<u8>} - Byte string containing the output amount of the swap
 */
export function swapMASForExactTokens(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const amountOut = args.nextU256().expect('amountOut is missing');
  const pairBinSteps = args
    .nextFixedSizeArray<u64>()
    .expect('pairBinSteps is missing');
  const tokenPath = args
    .nextSerializableObjectArray<IERC20>()
    .expect('tokenPath is missing');
  const to = new Address(args.nextString().expect('to is missing'));
  const deadline = args.nextU64().expect('deadline is missing');
  const masToSend = args.nextU64().expect('masToSend is missing');

  _ensure(deadline);
  _verifyInputs(pairBinSteps, tokenPath);

  // substract the amount of MAS used for storage fees
  const value = SafeMath.sub(sent, masToSend);
  const wmas = getWMAS();
  assert(
    tokenPath[0]._origin.equals(wmas),
    LBRouter__InvalidTokenPath(tokenPath[0]._origin),
  );

  const pairs = _getPairs(pairBinSteps, tokenPath);
  const amountsIn = _getAmountsIn(pairs, tokenPath, amountOut);

  assert(
    amountsIn[0] <= u256.from(value),
    LBRouter__MaxAmountInExceeded(u256.from(value), amountsIn[0]),
  );

  _wmasDepositAndTransfer(pairs[0], amountsIn[0].toU64());

  const amountOutReal = _swapTokensForExactTokens(pairs, tokenPath, to);
  assert(
    amountOutReal >= amountOut,
    LBRouter__InsufficientAmountOut(amountOut, amountOutReal),
  );

  if (value > amountsIn[0].toU64()) {
    transferCoins(to, value - amountsIn[0].toU64());
  }

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return u256ToBytes(amountOut);
}

/**
 * Swaps exact tokens for tokens while performing safety checks supporting for fee on transfer tokens
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - amountIn: The amount of token to send
 * - amountOutMin: The min amount of token to receive
 * - pairBinSteps: The bin steps of the pairs
 * - tokenPath: The swap path using the bin steps following `_pairBinSteps`
 * - to: The address of the recipient
 * - deadline: The deadline timestamp
 * @return {StaticArray<u8>} - Byte string containing the output amount of the swap
 */
export function swapExactTokensForTokensSupportingFeeOnTransferTokens(
  bs: StaticArray<u8>,
): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const amountIn = args.nextU256().expect('amountIn is missing');
  const amountOutMin = args.nextU256().expect('amountOutMin is missing');
  const pairBinSteps = args
    .nextFixedSizeArray<u64>()
    .expect('pairBinSteps is missing');
  const tokenPath = args
    .nextSerializableObjectArray<IERC20>()
    .expect('tokenPath is missing');
  const to = new Address(args.nextString().expect('to is missing'));
  const deadline = args.nextU64().expect('deadline is missing');

  _ensure(deadline);
  _verifyInputs(pairBinSteps, tokenPath);

  const pairs = _getPairs(pairBinSteps, tokenPath);

  const _targetToken = tokenPath[pairs.length];

  const balanceBefore = _targetToken.balanceOf(to);

  tokenPath[0].transferFrom(Context.caller(), pairs[0], amountIn);

  _swapSupportingFeeOnTransferTokens(pairs, tokenPath, to);

  const amountOut = SafeMath256.sub(_targetToken.balanceOf(to), balanceBefore);

  assert(
    amountOutMin <= amountOut,
    LBRouter__InsufficientAmountOut(amountOutMin, amountOut),
  );

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return u256ToBytes(amountOut);
}

/**
 * Swaps exact tokens for MAS while performing safety checks supporting for fee on transfer tokens
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - amountIn: The amount of token to send
 * - amountOutMinMAS: The min amount of MAS to receive
 * - pairBinSteps: The bin steps of the pairs
 * - tokenPath: The swap path using the bin steps following `_pairBinSteps`
 * - to: The address of the recipient
 * - deadline: The deadline timestamp
 * @return {StaticArray<u8>} - Byte string containing the output amount of the swap
 */
export function swapExactTokensForMASSupportingFeeOnTransferTokens(
  bs: StaticArray<u8>,
): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const amountIn = args.nextU256().expect('amountIn is missing');
  const amountOutMinMAS = args.nextU256().expect('amountOutMinMAS is missing');
  const pairBinSteps = args
    .nextFixedSizeArray<u64>()
    .expect('pairBinSteps is missing');
  const tokenPath = args
    .nextSerializableObjectArray<IERC20>()
    .expect('tokenPath is missing');
  const to = new Address(args.nextString().expect('to is missing'));
  const deadline = args.nextU64().expect('deadline is missing');

  _ensure(deadline);
  _verifyInputs(pairBinSteps, tokenPath);

  const wmas = new IWMAS(getWMAS());
  assert(
    tokenPath[pairBinSteps.length]._origin.equals(wmas._origin),
    LBRouter__InvalidTokenPath(tokenPath[pairBinSteps.length]._origin),
  );

  const pairs = _getPairs(pairBinSteps, tokenPath);

  const balanceBefore = wmas.balanceOf(Context.callee());

  tokenPath[0].transferFrom(Context.caller(), pairs[0], amountIn);

  _swapSupportingFeeOnTransferTokens(pairs, tokenPath, Context.callee());

  const amountOut = SafeMath256.sub(
    wmas.balanceOf(Context.callee()),
    balanceBefore,
  );

  assert(
    amountOutMinMAS <= amountOut,
    LBRouter__InsufficientAmountOut(amountOutMinMAS, amountOut),
  );

  wmas.withdraw(amountOut.toU64(), to);

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return u256ToBytes(amountOut);
}

/**
 * Swaps exact MAS for tokens while performing safety checks supporting for fee on transfer tokens
 *
 * @param {StaticArray<u8>} bs - Byte string containing:
 * - amountOutMin: The min amount of token to receive
 * - pairBinSteps: The bin steps of the pairs
 * - tokenPath: The swap path using the bin steps following `_pairBinSteps`
 * - to: The address of the recipient
 * - deadline: The deadline timestamp
 * - masToSend: The amount of MAS to send for storage fees
 * @return {StaticArray<u8>} - Byte string containing the output amount of the swap
 */
export function swapExactMASForTokensSupportingFeeOnTransferTokens(
  bs: StaticArray<u8>,
): StaticArray<u8> {
  const SCBalance = balance();
  const sent = Context.transferredCoins();

  const args = new Args(bs);
  const amountOutMin = args.nextU256().expect('amountOutMin is missing');
  const pairBinSteps = args
    .nextFixedSizeArray<u64>()
    .expect('pairBinSteps is missing');
  const tokenPath = args
    .nextSerializableObjectArray<IERC20>()
    .expect('tokenPath is missing');
  const to = new Address(args.nextString().expect('to is missing'));
  const deadline = args.nextU64().expect('deadline is missing');
  const masToSend = args.nextU64().expect('masToSend is missing');

  _ensure(deadline);
  _verifyInputs(pairBinSteps, tokenPath);

  // substract the amount of MAS used for storage fees
  const value = SafeMath.sub(sent, masToSend);
  const wmas = new IWMAS(getWMAS());
  assert(
    tokenPath[0]._origin.equals(wmas._origin),
    LBRouter__InvalidTokenPath(tokenPath[0]._origin),
  );

  const pairs = _getPairs(pairBinSteps, tokenPath);

  const _targetToken = tokenPath[pairs.length];

  const _balanceBefore = _targetToken.balanceOf(to);

  _wmasDepositAndTransfer(pairs[0], value);

  _swapSupportingFeeOnTransferTokens(pairs, tokenPath, to);

  const amountOut = SafeMath256.sub(_targetToken.balanceOf(to), _balanceBefore);
  assert(
    amountOutMin <= amountOut,
    LBRouter__InsufficientAmountOut(amountOutMin, amountOut),
  );

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return u256ToBytes(amountOut);
}

// ======================================================== //
// ====             FACTORY OWNER FUNCTIONS            ==== //
// ======================================================== //

/** Unstuck tokens that are sent to this contract by mistake
 * @dev Only callable by the factory owner
 * @param _token The address of the token
 * @param _to The address of the user to send back the tokens
 * @param _amount The amount to send
 */
export function sweep(bs: StaticArray<u8>): void {
  onlyFactoryOwner();

  const args = new Args(bs);
  const _token = new IERC20(
    new Address(args.nextString().expect('_token is missing')),
  );
  const _to = new Address(args.nextString().expect('_to is missing'));
  let _amount = args.nextU256().expect('_amount is missing');

  if (_token._origin.equals(new Address('0'))) {
    if (_amount == u256.Max)
      _amount = u256.from(balanceOf(Context.callee().toString()));
    transferCoins(_to, _amount.toU64());
  } else {
    if (_amount == u256.Max) _amount = _token.balanceOf(Context.callee());
    _token.transfer(_to, _amount);
  }
}

/** Unstuck LBTokens that are sent to this contract by mistake
 * @dev Only callable by the factory owner
 * @param _lbToken The address of the LBToken
 * @param _to The address of the user to send back the tokens
 * @param _ids The list of token ids
 * @param _amounts The list of amounts to send
 */
export function sweepLBToken(bs: StaticArray<u8>): void {
  onlyFactoryOwner();

  const args = new Args(bs);
  const _lbToken = new IPair(
    new Address(args.nextString().expect('_lbToken is missing')),
  );
  const _to = new Address(args.nextString().expect('_to is missing'));
  const _ids = args.nextFixedSizeArray<u64>().expect('_ids is missing');
  const _amounts = args
    .nextFixedSizeArray<u256>()
    .expect('_amounts is missing');
  const _masToSend = args.nextU64().expect('_masToSend is missing');

  _lbToken.safeBatchTransferFrom(
    Context.callee(),
    _to,
    _ids,
    _amounts,
    _masToSend,
  );
}

// ======================================================== //
// ====                INTERNAL FUNCTIONS              ==== //
// ======================================================== //

/**
 * @notice Helper function to add liquidity
 * @param _liquidityParameters The liquidity parameters
 * @param _LBPair LBPair where liquidity is deposited
 * @return {StaticArray<u8>} - Byte string containing:
 * - liquidityMinted: Amounts of LBToken minted for each bin
 * - depositIds: Bin ids where the liquidity was actually deposited
 */
function _addLiquidity(
  _liq: LiquidityParameters,
  _LBPair: IPair,
): StaticArray<u8> {
  if (
    _liq.deltaIds.length != _liq.distributionX.length &&
    _liq.deltaIds.length != _liq.distributionY.length
  )
    assert(false, LBRouter__LengthsMismatch());

  const MAX_U32 = u64(u32.MAX_VALUE);
  assert(
    _liq.activeIdDesired <= MAX_U32 && _liq.idSlippage <= MAX_U32,
    LBRouter__IdDesiredOverflows(_liq.activeIdDesired, _liq.idSlippage),
  );

  const pair = _LBPair.getPairInformation();
  assert(
    SafeMath.add(_liq.activeIdDesired, _liq.idSlippage) >= pair.activeId &&
      SafeMath.add(pair.activeId, _liq.idSlippage) >= _liq.activeIdDesired,
    LBRouter__IdSlippageCaught(
      _liq.activeIdDesired,
      _liq.idSlippage,
      pair.activeId,
    ),
  );

  const depositIds: u64[] = [];
  for (let i = 0; i < _liq.deltaIds.length; ++i) {
    const _id = i64(pair.activeId) + _liq.deltaIds[i];
    const cond2 = _id < i64(0) || u64(_id) > MAX_U32;
    assert(!cond2, LBRouter__IdOverflows(_id));
    depositIds[i] = u64(_id);
  }

  const r = _LBPair.mint(
    depositIds,
    _liq.distributionX,
    _liq.distributionY,
    _liq.to,
    balance(),
  );

  const cond3 =
    r.amountXAdded < _liq.amountXMin || r.amountYAdded < _liq.amountYMin;
  assert(
    !cond3,
    LBRouter__AmountSlippageCaught(
      _liq.amountXMin,
      r.amountXAdded,
      _liq.amountYMin,
      r.amountYAdded,
    ),
  );

  return new Args().add(r.liquidityMinted).add(depositIds).serialize();
}

/**
 * @notice Helper function to remove liquidity
 * @param _LBPair The address of the LBPair
 * @param _amountXMin The min amount to receive of token X
 * @param _amountYMin The min amount to receive of token Y
 * @param _ids The list of ids to burn
 * @param _amounts The list of amounts to burn of each id in `_ids`
 * @param _to The address of the recipient
 * @return amountX The amount of token X sent by the pair
 * @return amountY The amount of token Y sent by the pair
 */
function _removeLiquidity(
  _LBPair: IPair,
  _amountXMin: u256,
  _amountYMin: u256,
  _ids: u64[],
  _amounts: u256[],
  _to: Address,
): Amounts {
  new IPair(_LBPair._origin).safeBatchTransferFrom(
    Context.caller(),
    _LBPair._origin,
    _ids,
    _amounts,
    balance(),
  );
  const r = _LBPair.burn(_ids, _amounts, _to, balance());
  assert(
    r.amountX >= _amountXMin && r.amountY >= _amountYMin,
    LBRouter__AmountSlippageCaught(
      _amountXMin,
      r.amountX,
      _amountYMin,
      r.amountY,
    ),
  );
  return new Amounts(r.amountX, r.amountY);
}

/**
 * Helper function to swap exact tokens for tokens
 * @param _pairs The list of pairs
 * @param _tokenPath The swap path using the binSteps following `_pairBinSteps`
 * @param _to The address of the recipient
 * @returns amountOut The amount of token sent to `_to`
 */
function _swapExactTokensForTokens(
  _pairs: Address[],
  _tokenPath: IERC20[],
  _to: Address,
): u256 {
  let _recipient: Address;
  let _pair: Address;

  let _tokenNext: IERC20 = _tokenPath[0];
  let amountOut: u256 = u256.Zero;

  for (let i = 0; i < _pairs.length; ++i) {
    _pair = _pairs[i];

    _tokenNext = _tokenPath[i + 1];

    _recipient = i + 1 == _pairs.length ? _to : _pairs[i + 1];

    const _swapForY = _tokenNext.equals(new IPair(_pair).getTokenY());
    amountOut = new IPair(_pair).swap(_swapForY, _recipient, balance());
  }
  return amountOut;
}

/**
 * Helper function to swap tokens for exact tokens
 * @param _pairs The array of pairs
 * @param _tokenPath The swap path using the binSteps following `_pairBinSteps`
 * @param _to The address of the recipient
 * @returns amountOut The amount of token sent to `_to`
 */
function _swapTokensForExactTokens(
  _pairs: Address[],
  _tokenPath: IERC20[],
  _to: Address,
): u256 {
  let _recipient: Address;
  let _pair: Address;

  let _tokenNext = _tokenPath[0];
  let amountOut: u256 = u256.Zero;

  for (let i = 0; i < _pairs.length; ++i) {
    _pair = _pairs[i];

    _tokenNext = _tokenPath[i + 1];

    _recipient = i + 1 == _pairs.length ? _to : _pairs[i + 1];

    const _swapForY = _tokenNext.equals(new IPair(_pair).getTokenY());

    const _amountOut = new IPair(_pair).swap(_swapForY, _recipient, balance());

    if (_swapForY) amountOut = SafeMath256.add(amountOut, _amountOut);
    else amountOut = SafeMath256.add(amountOut, _amountOut);
  }

  return amountOut;
}

/**
 * @notice Helper function to swap exact tokens supporting for fee on transfer tokens
 * @param _pairs The list of pairs
 * @param _tokenPath The swap path using the binSteps following `_pairBinSteps`
 * @param _to The address of the recipient
 */
function _swapSupportingFeeOnTransferTokens(
  _pairs: Address[],
  _tokenPath: IERC20[],
  _to: Address,
): void {
  let _recipient: Address;
  let _pair: Address;

  let _tokenNext = _tokenPath[0];

  for (let i = 0; i < _pairs.length; ++i) {
    _pair = _pairs[i];

    _tokenNext = _tokenPath[i + 1];

    _recipient = i + 1 == _pairs.length ? _to : _pairs[i + 1];

    const _swapForY = _tokenNext.equals(new IPair(_pair).getTokenY());

    new IPair(_pair).swap(_swapForY, _recipient, balance());
  }
}

// ======================================================== //
// ====                    HELPERS                     ==== //
// ======================================================== //

/**
 * Helper function to return the amounts in
 * @param _pairs The list of pairs
 * @param _tokenPath The swap path
 * @param _amountOut The amount out
 * @return amountsIn The list of amounts in
 */
function _getAmountsIn(
  _pairs: Address[],
  _tokenPath: IERC20[],
  _amountOut: u256,
): u256[] {
  const amountsIn: u256[] = [];
  amountsIn[_pairs.length] = _amountOut;

  for (let i = _pairs.length; i != 0; i--) {
    const _token = _tokenPath[i - 1];

    const _pair = _pairs[i - 1];
    const r = SwapHelper.getSwapIn(
      new IPair(_pair),
      amountsIn[i],
      new IPair(_pair).getTokenX().equals(_token),
    ).unwrap();

    amountsIn[i - 1] = r.amountIn;
  }
  return amountsIn;
}

/**
 * Helper function to deposit and transfer wmas
 * @param _to The address of the recipient
 * @param _amount The MAS amount to wrap
 */
function _wmasDepositAndTransfer(_to: Address, _amount: u64): void {
  const wmas = new IWMAS(getWMAS());
  const amount = SafeMath.add(
    _amount,
    wmas.computeMintStorageCost(Context.callee()),
  );
  wmas.deposit(amount);
  const feeTransfer = wmas.computeMintStorageCost(_to);
  wmas.transferWithFee(_to, u256.from(_amount), feeTransfer);
}

/**
 * Simulate a swap in
 */
export function getSwapIn(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _pair = new IPair(
    new Address(args.nextString().expect('_pair is missing')),
  );
  const _amountOut = args.nextU256().expect('_amountOut is missing');
  const _swapForY = args.nextBool().expect('_swapForY is missing');

  const r = SwapHelper.getSwapIn(_pair, _amountOut, _swapForY).unwrap();
  return new Args().add(r.amountIn).add(r.feesIn).serialize();
}

/**
 * Simulate a swap out
 */
export function getSwapOut(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _pair = new IPair(
    new Address(args.nextString().expect('_pair is missing')),
  );
  const _amountIn = args.nextU256().expect('_amountIn is missing');
  const _swapForY = args.nextBool().expect('_swapForY is missing');

  const r = SwapHelper.getSwapOut(_pair, _amountIn, _swapForY).unwrap();
  return new Args().add(r.amountOut).add(r.feesIn).serialize();
}

/**
 *  Helper function to return the address of the LBPair
 * @dev Revert if the pair is not created yet
 * @param _tokenX The address of the tokenX
 * @param _tokenY The address of the tokenY
 * @param _binStep The bin step of the LBPair
 * @return The address of the LBPair
 */
function _getLBPairInformation(
  _tokenX: IERC20,
  _tokenY: IERC20,
  _binStep: u64,
): IPair {
  const factory = getFactory();
  const _LBPair: IPair = factory.getLBPairInformation(
    _tokenX._origin,
    _tokenY._origin,
    _binStep,
  ).pair;
  // assert(_LBPair._origin.notEqual(new Address("0")), "pair not created");
  return _LBPair;
}

/**
 * Helper function to return the address of the pair
 * @dev Revert if the pair is not created yet
 * @param _binStep The bin step of the LBPair
 * @param _tokenX The address of the tokenX
 * @param _tokenY The address of the tokenY
 * @return The address of the pair of binStep `_binStep`
 */
function _getPair(_binStep: u64, _tokenX: IERC20, _tokenY: IERC20): Address {
  return _getLBPairInformation(_tokenX, _tokenY, _binStep)._origin;
}

function _getPairs(_pairBinSteps: u64[], _tokenPath: IERC20[]): Address[] {
  const _pairs: Address[] = [];
  let _token: IERC20;
  let _tokenNext = _tokenPath[0];
  for (let i = 0; i < _pairBinSteps.length; ++i) {
    _token = _tokenNext;
    _tokenNext = _tokenPath[i + 1];
    _pairs.push(_getPair(_pairBinSteps[i], _token, _tokenNext));
  }
  return _pairs;
}

// ======================================================== //
// ====                    GETTERS                     ==== //
// ======================================================== //

function getWMAS(): Address {
  const wmas = new Address(Storage.get(WMAS));
  return wmas;
}

function getFactory(): IFactory {
  const factory = new Address(Storage.get(FACTORY));
  return new IFactory(factory);
}

// ======================================================== //
// ====                    MODIFIERS                   ==== //
// ======================================================== //

function onlyFactoryOwner(): void {
  assert(
    Context.caller().equals(getFactory().getOwner()),
    LBRouter__NotFactoryOwner(),
  );
}

function _ensure(deadline: u64): void {
  assert(
    Context.timestamp() <= deadline,
    LBRouter__DeadlineExceeded(deadline, Context.timestamp()),
  );
}

function _verifyInputs(pairBinSteps: u64[], tokenPath: IERC20[]): void {
  assert(
    pairBinSteps.length + 1 == tokenPath.length,
    LBRouter__LengthsMismatch(),
  );
}

/**
 * @notice Function used by an SC to receive Massa coins
 * @param _ unused
 */
export function receiveCoins(_: StaticArray<u8>): void {}
