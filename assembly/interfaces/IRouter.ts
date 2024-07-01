import { Args, bytesToString, bytesToU256 } from '@massalabs/as-types';
import { Address, call } from '@massalabs/massa-as-sdk';
import { LiquidityParameters } from '../structs/LiquidityParameters';
import { IERC20 } from './IERC20';
import { IPair } from './IPair';
import {
  AddLiquidity,
  Amounts,
  GetSwapInReturn,
  GetSwapOutReturn,
} from '../structs/Returns';
import { u256 } from 'as-bignum/assembly/integer/u256';

export class IRouter {
  _origin: Address;

  /**
   * Wraps a smart contract exposing standard token FFI.
   *
   * @param {Address} at - Address of the smart contract.
   */
  constructor(at: Address) {
    this._origin = at;
  }

  /**
   * Calls the constructor.
   *
   * @param {Address} wmas - The address of WMAS
   * @param {Address} factory - The address of the factory
   */
  init(wmas: Address, factory: Address): void {
    const args = new Args();
    args.add(wmas);
    args.add(factory);
    call(this._origin, 'constructor', args, 0);
  }

  /**
   * Create a liquidity bin LBPair for _tokenX and _tokenY using the factory
   *
   * @param {IERC20} tokenX - The address of the first token
   * @param {IERC20} tokenY - The address of the second token
   * @param {u32} activeId - The active id of the pair
   * @param {u32} binStep - The bin step in basis point, used to calculate log(1 + binStep)
   * @param {u64} masToSend - The amount of MAS to send for storage
   * @return {Address} - The address of the newly created LBPair
   */
  createLBPair(
    tokenX: IERC20,
    tokenY: IERC20,
    activeId: u32,
    binStep: u32,
    masToSend: u64,
  ): Address {
    const args = new Args()
      .add(tokenX._origin)
      .add(tokenY._origin)
      .add(activeId)
      .add(binStep);
    const res = call(this._origin, 'createLBPair', args, masToSend);
    return new Address(bytesToString(res));
  }

  /**
   * Add liquidity while performing safety checks
   * This function is compliant with fee on transfer tokens
   *
   * @param {LiquidityParameters} liquidityParameters - The liquidity parameters
   * @param {u64} masToSend - The amount of MAS to send for storage
   * @return {AddLiquidity} - The amount of tokens minted and the ids of the deposits
   */
  addLiquidity(
    liquidityParameters: LiquidityParameters,
    masToSend: u64,
  ): AddLiquidity {
    const args = new Args().add(liquidityParameters);
    const res = new Args(call(this._origin, 'addLiquidity', args, masToSend));
    return new AddLiquidity(
      res.nextFixedSizeArray<u256>().unwrap(),
      res.nextFixedSizeArray<u64>().unwrap(),
    );
  }

  /**
   * Add liquidity with MAS while performing safety checks
   * This function is compliant with fee on transfer tokens
   *
   * @param {LiquidityParameters} liquidityParameters - The liquidity parameters
   * @param {u256} amountTotal - The amount of MAS to deposit + the amount of MAS to send for storage
   * @param {u64} masToSend - The amount of MAS to send for storage
   * @return {AddLiquidity} - The amount of tokens minted and the ids of the deposits
   */
  addLiquidityMAS(
    liquidityParameters: LiquidityParameters,
    amountTotal: u256,
    masToSend: u64,
  ): AddLiquidity {
    const args = new Args().add(liquidityParameters).add(masToSend);
    const res = new Args(
      call(this._origin, 'addLiquidityMAS', args, amountTotal.toU64()),
    );
    return new AddLiquidity(
      res.nextFixedSizeArray<u256>().unwrap(),
      res.nextFixedSizeArray<u64>().unwrap(),
    );
  }

  /**
   * Remove liquidity while performing safety checks
   * This function is compliant with fee on transfer tokens
   *
   * @param {Address} tokenX - The address of token X
   * @param {Address} tokenY - The address of token Y
   * @param {u32} binStep - The bin step of the LBPair
   * @param {u256} amountXMin - The min amount to receive of token X
   * @param {u256} amountYMin - The min amount to receive of token Y
   * @param {Array<u64>} ids - The list of ids to burn
   * @param {Array<u256>} amounts - The list of amounts to burn of each id in `ids`
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   * @param {u64} masToSend - The amount of MAS to send for storage
   * @return {Array<u256>} - The amount of tokens received
   */
  removeLiquidity(
    tokenX: Address,
    tokenY: Address,
    binStep: u32,
    amountXMin: u256,
    amountYMin: u256,
    ids: Array<u64>,
    amounts: Array<u256>,
    to: Address,
    deadline: u64,
    masToSend: u64,
  ): Amounts {
    const args = new Args()
      .add(tokenX)
      .add(tokenY)
      .add(binStep)
      .add(amountXMin)
      .add(amountYMin)
      .add(ids)
      .add(amounts)
      .add(to)
      .add(deadline);
    const res = new Args(
      call(this._origin, 'removeLiquidity', args, masToSend),
    );
    return new Amounts(res.nextU256().unwrap(), res.nextU256().unwrap());
  }

  /**
   * Remove liquidity with MAS while performing safety checks
   * This function is compliant with fee on transfer tokens
   *
   * @param {Address} token - The address of token
   * @param {u32} binStep - The bin step of the LBPair
   * @param {u256} amountTokenMin - The min amount to receive of token
   * @param {u256} amountMasMin - The min amount to receive of MAS
   * @param {Array<u64>} ids - The list of ids to burn
   * @param {Array<u256>} amounts - The list of amounts to burn of each id in `ids`
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   * @param {u64} masToSend - The amount of MAS to send for storage
   */
  removeLiquidityMAS(
    token: Address,
    binStep: u32,
    amountTokenMin: u256,
    amountMasMin: u256,
    ids: Array<u64>,
    amounts: Array<u256>,
    to: Address,
    deadline: u64,
    masToSend: u64,
  ): Amounts {
    const args = new Args()
      .add(token)
      .add(binStep)
      .add(amountTokenMin)
      .add(amountMasMin)
      .add(ids)
      .add(amounts)
      .add(to)
      .add(deadline);
    const res = new Args(
      call(this._origin, 'removeLiquidityMAS', args, masToSend),
    );
    return new Amounts(res.nextU256().unwrap(), res.nextU256().unwrap());
  }

  /**
   * Swaps exact tokens for tokens while performing safety checks
   *
   * @param {u256} amountIn - The amount of tokens to send
   * @param {u256} amountOutMin - The min amount of tokens to receive
   * @param {Array<u64>} pairBinSteps - The bin step of the pairs
   * @param {IERC20[]} tokenPath - The swap path using the binSteps following `_pairBinSteps`
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   * @param {u64} masToSend - The amount of Massa to send for storage
   * @return {u256} - The output amount of the swap
   */
  swapExactTokensForTokens(
    amountIn: u256,
    amountOutMin: u256,
    pairBinSteps: Array<u64>,
    tokenPath: IERC20[],
    to: Address,
    deadline: u64,
    masToSend: u64,
  ): u256 {
    const args = new Args()
      .add(amountIn)
      .add(amountOutMin)
      .add(pairBinSteps)
      .addSerializableObjectArray(tokenPath)
      .add(to)
      .add(deadline);
    const res = call(this._origin, 'swapExactTokensForTokens', args, masToSend);
    return bytesToU256(res);
  }

  /**
   * Swaps exact tokens for MAS while performing safety checks
   *
   * @param {u256} amountIn - The amount of tokens to send
   * @param {u256} amountOutMinMAS - The min amount of MAS to receive
   * @param {Array<u64>} pairBinSteps - The bin step of the pairs
   * @param {IERC20[]} tokenPath - The swap path using the binSteps following `_pairBinSteps`
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   * @param {u64} masToSend - The amount of Massa to send for storage
   * @return {u256} - The output amount of the swap
   */
  swapExactTokensForMAS(
    amountIn: u256,
    amountOutMinMAS: u256,
    pairBinSteps: Array<u64>,
    tokenPath: IERC20[],
    to: Address,
    deadline: u64,
    masToSend: u64,
  ): u256 {
    const args = new Args()
      .add(amountIn)
      .add(amountOutMinMAS)
      .add(pairBinSteps)
      .addSerializableObjectArray(tokenPath)
      .add(to)
      .add(deadline);
    const res = call(this._origin, 'swapExactTokensForMAS', args, masToSend);
    return bytesToU256(res);
  }

  /**
   * Swaps exact MAS for tokens while performing safety checks
   *
   * @param {u256} amountIn - The amount of MAS to send for swap and storage
   * @param {u256} amountOutMin - The min amount of token to receive
   * @param {Array<u64>} pairBinSteps - The bin step of the pairs
   * @param {IERC20[]} tokenPath - The swap path using the binSteps following `_pairBinSteps`
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   * @param {u64} masToSend - The amount of Massa to send for storage
   * @return {u256} - The output amount of the swap
   */
  swapExactMASForTokens(
    amountIn: u256,
    amountOutMin: u256,
    pairBinSteps: Array<u64>,
    tokenPath: IERC20[],
    to: Address,
    deadline: u64,
    masToSend: u64,
  ): u256 {
    const args = new Args()
      .add(amountOutMin)
      .add(pairBinSteps)
      .addSerializableObjectArray(tokenPath)
      .add(to)
      .add(deadline)
      .add(masToSend);
    const res = call(
      this._origin,
      'swapExactMASForTokens',
      args,
      amountIn.toU64(),
    );
    return bytesToU256(res);
  }

  /**
   * Swaps tokens for exact tokens while performing safety checks
   *
   * @param {u256} amountOut - The amount of token to receive
   * @param {u256} amountInMax - The max amount of token to send
   * @param {Array<u64>} pairBinSteps - The bin step of the pairs
   * @param {IERC20[]} tokenPath - The swap path using the binSteps following `_pairBinSteps`
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   * @param {u64} masToSend - The amount of Massa to send for storage
   * @return {u256} - The output amount of the swap
   */
  swapTokensForExactTokens(
    amountOut: u256,
    amountInMax: u256,
    pairBinSteps: Array<u64>,
    tokenPath: IERC20[],
    to: Address,
    deadline: u64,
    masToSend: u64,
  ): u256 {
    const args = new Args()
      .add(amountOut)
      .add(amountInMax)
      .add(pairBinSteps)
      .addSerializableObjectArray(tokenPath)
      .add(to)
      .add(deadline);
    const res = call(this._origin, 'swapTokensForExactTokens', args, masToSend);
    return bytesToU256(res);
  }

  /**
   * Swaps tokens for exact MAS while performing safety checks
   *
   * @param {u256} amountOut - The amount of MAS to receive
   * @param {u256} amountInMax - The max amount of token to send
   * @param {Array<u64>} pairBinSteps - The bin step of the pairs
   * @param {IERC20[]} tokenPath - The swap path using the binSteps following `_pairBinSteps`
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   * @param {u64} masToSend - The amount of Massa to send for storage
   * @return {u256} - The output amount of the swap
   */
  swapTokensForExactMAS(
    amountOut: u256,
    amountInMax: u256,
    pairBinSteps: Array<u64>,
    tokenPath: IERC20[],
    to: Address,
    deadline: u64,
    masToSend: u64,
  ): u256 {
    const args = new Args()
      .add(amountOut)
      .add(amountInMax)
      .add(pairBinSteps)
      .addSerializableObjectArray(tokenPath)
      .add(to)
      .add(deadline);
    const res = call(this._origin, 'swapTokensForExactMAS', args, masToSend);
    return bytesToU256(res);
  }

  /**
   * Swaps MAS for exact tokens while performing safety checks
   *
   * @param {u256} amountOut - The amount of token to receive
   * @param {u256} amountInMax - The max amount of Mas to send
   * @param {Array<u64>} pairBinSteps - The bin step of the pairs
   * @param {IERC20[]} tokenPath - The swap path using the binSteps following `_pairBinSteps`
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   * @param {u64} masToSend - The amount of Massa to send for storage
   * @return {u256} - The output amount of the swap
   */
  swapMASForExactTokens(
    amountOut: u256,
    amountInMax: u256,
    pairBinSteps: Array<u64>,
    tokenPath: IERC20[],
    to: Address,
    deadline: u64,
    masToSend: u64,
  ): u256 {
    const args = new Args()
      .add(amountOut)
      .add(pairBinSteps)
      .addSerializableObjectArray(tokenPath)
      .add(to)
      .add(deadline)
      .add(masToSend);
    const res = call(
      this._origin,
      'swapMASForExactTokens',
      args,
      amountInMax.toU64(),
    );
    return bytesToU256(res);
  }

  /**
   * Swaps exact tokens for tokens while performing safety checks supporting for fee on transfer tokens
   *
   * @param {u256} amountIn - The amount of token to send
   * @param {u256} amountOutMin - The min amount of token to receive
   * @param {Array<u64>} pairBinSteps - The bin step of the pairs
   * @param {IERC20[]} tokenPath - The swap path using the binSteps following `_pairBinSteps`
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   * @param {u64} masToSend - The amount of Massa to send for storage
   * @return {u256} - The output amount of the swap
   */
  swapExactTokensForTokensSupportingFeeOnTransferTokens(
    amountIn: u256,
    amountOutMin: u256,
    pairBinSteps: Array<u64>,
    tokenPath: IERC20[],
    to: Address,
    deadline: u64,
    masToSend: u64,
  ): u256 {
    const args = new Args()
      .add(amountIn)
      .add(amountOutMin)
      .add(pairBinSteps)
      .addSerializableObjectArray(tokenPath)
      .add(to)
      .add(deadline);
    const res = call(
      this._origin,
      'swapExactTokensForTokensSupportingFeeOnTransferTokens',
      args,
      masToSend,
    );
    return bytesToU256(res);
  }

  /**
   * Swaps exact tokens for MAS while performing safety checks supporting for fee on transfer tokens
   *
   * @param {u256} amountIn - The amount of token to send
   * @param {u256} amountOutMinMAS - The min amount of MAS to receive
   * @param {Array<u64>} pairBinSteps - The bin step of the pairs
   * @param {IERC20[]} tokenPath - The swap path using the binSteps following `_pairBinSteps`
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   * @param {u64} masToSend - The amount of Massa to send for storage
   * @return {u256} - The output amount of the swap
   */
  swapExactTokensForMASSupportingFeeOnTransferTokens(
    amountIn: u256,
    amountOutMinMAS: u256,
    pairBinSteps: Array<u64>,
    tokenPath: IERC20[],
    to: Address,
    deadline: u64,
    masToSend: u64,
  ): u256 {
    const args = new Args()
      .add(amountIn)
      .add(amountOutMinMAS)
      .add(pairBinSteps)
      .addSerializableObjectArray(tokenPath)
      .add(to)
      .add(deadline);
    const res = call(
      this._origin,
      'swapExactTokensForMASSupportingFeeOnTransferTokens',
      args,
      masToSend,
    );
    return bytesToU256(res);
  }

  /**
   * Swaps exact MAS for tokens while performing safety checks supporting for fee on transfer tokens
   *
   * @param {u256} amountIn - The amount of MAS to send for swap and storage
   * @param {u256} amountOutMin - The min amount of token to receive
   * @param {Array<u64>} pairBinSteps - The bin step of the pairs
   * @param {IERC20[]} tokenPath - The swap path using the binSteps following `_pairBinSteps`
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   * @param {u64} masToSend - The amount of Massa to send for storage
   * @return {u256} - The output amount of the swap
   */
  swapExactMASForTokensSupportingFeeOnTransferTokens(
    amountIn: u256,
    amountOutMin: u256,
    pairBinSteps: Array<u64>,
    tokenPath: IERC20[],
    to: Address,
    deadline: u64,
    masToSend: u64,
  ): u256 {
    const args = new Args()
      .add(amountOutMin)
      .add(pairBinSteps)
      .addSerializableObjectArray(tokenPath)
      .add(to)
      .add(deadline)
      .add(masToSend);
    const res = call(
      this._origin,
      'swapExactMASForTokensSupportingFeeOnTransferTokens',
      args,
      amountIn.toU64(),
    );
    return bytesToU256(res);
  }

  getSwapIn(_pair: IPair, _amountOut: u256, _swapForY: bool): GetSwapInReturn {
    const args = new Args().add(_pair._origin).add(_amountOut).add(_swapForY);
    const result = new Args(call(this._origin, 'getSwapIn', args, 0));
    return new GetSwapInReturn(
      result.nextU256().unwrap(),
      result.nextU256().unwrap(),
    );
  }

  getSwapOut(_pair: IPair, _amountIn: u256, _swapForY: bool): GetSwapOutReturn {
    const args = new Args().add(_pair._origin).add(_amountIn).add(_swapForY);
    const result = new Args(call(this._origin, 'getSwapOut', args, 0));
    return new GetSwapOutReturn(
      result.nextU256().unwrap(),
      result.nextU256().unwrap(),
    );
  }
}
