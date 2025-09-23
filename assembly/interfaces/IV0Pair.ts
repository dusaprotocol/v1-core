import { Args, bytesToU256, bytesToU64 } from '@massalabs/as-types';
import { Address, call, Storage } from '@massalabs/massa-as-sdk';
import { u256 } from 'as-bignum/assembly/integer/u256';
import { Amounts } from '../structs/Returns';
import { IERC20 } from './IERC20';
import {
  blockTimestampLast,
  FACTORY,
  price0CumulativeLast,
  price1CumulativeLast,
  RESERVE_0,
  RESERVE_1,
  TOKEN_0,
  TOKEN_1,
} from '../storage/V0Pair';
import { IFactory } from './IFactory';
import { ONE_COIN, ZERO } from '../libraries/Constants';

export class IV0Pair {
  _origin: Address;

  constructor(_origin: Address) {
    this._origin = _origin;
  }

  init(tokenA: Address, tokenB: Address): StaticArray<u8> {
    const args = new Args().add(tokenA).add(tokenB);
    return call(this._origin, 'constructor', args, 2 * ONE_COIN);
  }

  /**
   * Mint liquidity tokens.
   * This low-level function should be called from a contract which performs important safety checks.
   *
   * @param {Address} to - The address to mint the liquidity tokens to.
   * @param {u64} fee - The fee to be paid for storage.
   * @returns {u256} - The amount of liquidity minted.
   */
  mint(to: Address, fee: u64): u256 {
    const args = new Args().add(to);
    return bytesToU256(call(this._origin, 'mint', args, fee));
  }

  /**
   * Burn liquidity tokens.
   * This low-level function should be called from a contract which performs important safety checks.
   *
   * @param {Address} to - The address to send the underlying assets to.
   * @returns {Amounts} - The amounts of token0 and token1 burned.
   */
  burn(to: Address): Amounts {
    const args = new Args().add(to);
    const res = new Args(call(this._origin, 'burn', args, 0));
    return new Amounts(res.nextU256().unwrap(), res.nextU256().unwrap());
  }

  /**
   * Swap tokens on a Uniswap V2-like DEX.
   * This function should be called from a contract which performs important safety checks.
   *
   * @param {u256} amount0Out - The amount of token0 to be sent.
   * @param {u256} amount1Out - The amount of token1 to be sent.
   * @param {Address} to - The address to send the tokens to.
   * @param {StaticArray<u8>} data - Additional data to pass to the recipient.
   */
  swap(
    amount0Out: u256,
    amount1Out: u256,
    to: Address,
    data: StaticArray<u8>,
  ): void {
    const args = new Args().add(amount0Out).add(amount1Out).add(to).add(data);
    call(this._origin, 'swap', args, 0);
  }

  token0(): IERC20 {
    return new IERC20(new Address(Storage.getOf(this._origin, TOKEN_0)));
  }

  token1(): IERC20 {
    return new IERC20(new Address(Storage.getOf(this._origin, TOKEN_1)));
  }

  getFactory(): IFactory {
    return new IFactory(new Address(Storage.getOf(this._origin, FACTORY)));
  }

  getBlockTimestampLast(): u64 {
    return Storage.hasOf(this._origin, blockTimestampLast)
      ? bytesToU64(Storage.getOf(this._origin, blockTimestampLast))
      : u64(0);
  }

  getPrice0CumulativeLast(): u256 {
    return Storage.has(price0CumulativeLast)
      ? bytesToU256(Storage.getOf(this._origin, price0CumulativeLast))
      : ZERO;
  }

  getPrice1CumulativeLast(): u256 {
    return Storage.has(price1CumulativeLast)
      ? bytesToU256(Storage.getOf(this._origin, price1CumulativeLast))
      : ZERO;
  }

  getReserves(): Amounts {
    return new Amounts(
      bytesToU256(Storage.getOf(this._origin, RESERVE_0)),
      bytesToU256(Storage.getOf(this._origin, RESERVE_1)),
    );
  }

  skim(to: Address): void {
    const args = new Args().add(to);
    call(this._origin, 'skim', args, 0);
  }

  sync(): void {
    call(this._origin, 'sync', new Args(), 0);
  }
}
