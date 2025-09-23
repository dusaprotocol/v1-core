import {
  Args,
  bytesToFixedSizeArray,
  bytesToString,
} from '@massalabs/as-types';
import { Address, call, Storage } from '@massalabs/massa-as-sdk';
import { ALL_PAIRS_KEY, FEE_TO_KEY, PAIRS } from '../storage/V0Factory';
import { IV0Pair } from './IV0Pair';
import { createKey } from '../libraries';

export class IV0Factory {
  _origin: Address;

  constructor(_origin: Address) {
    this._origin = _origin;
  }

  init(_feeToSetter: Address): StaticArray<u8> {
    const args = new Args().add(_feeToSetter);
    return call(this._origin, 'constructor', args, 0);
  }

  /**
   * Creates a new pair for tokenA and tokenB.
   *
   * @param {Address} tokenA - The address of the first token.
   * @param {Address} tokenB - The address of the second token.
   * @param {u64} amount - The amount of coins to transfer to the pair for storage fee.
   * @returns {Address} - The address of the created pair.
   */
  createPair(_tokenA: Address, _tokenB: Address, amount: u64): Address {
    const args = new Args().add(_tokenA).add(_tokenB);
    const res = call(this._origin, 'createPair', args, amount);
    return new Address(bytesToString(res));
  }

  /**
   * Returns the length of the allPairs array.
   *
   * @returns {u32} - The number of pairs.
   */
  allPairsLength(): u32 {
    const allPairs = bytesToFixedSizeArray<string>(
      Storage.getOf(this._origin, ALL_PAIRS_KEY),
    );
    return allPairs.length;
  }

  /**
   * Returns the feeTo address.
   *
   * @returns {Address} - The feeTo address.
   */
  feeTo(): Address {
    return new Address(Storage.getOf(this._origin, FEE_TO_KEY));
  }

  getPair(tokenA: Address, tokenB: Address): IV0Pair {
    const token0 = tokenA.toString() < tokenB.toString() ? tokenA : tokenB;
    const token1 = tokenA.toString() > tokenB.toString() ? tokenA : tokenB;
    const key = createKey([token0.toString(), token1.toString()]);

    return new IV0Pair(new Address(PAIRS.getOf(this._origin, key, '')));
  }
}
