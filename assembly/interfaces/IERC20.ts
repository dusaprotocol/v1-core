import {
  Args,
  NoArg,
  Result,
  Serializable,
  byteToU8,
  stringToBytes,
} from '@massalabs/as-types';
import { Address, Context, Storage, call } from '@massalabs/massa-as-sdk';
import { TokenWrapper } from '@massalabs/sc-standards/assembly/contracts/FT';
import { BALANCE_KEY_PREFIX } from '@massalabs/sc-standards/assembly/contracts/FT/token-internals';
import { u256 } from 'as-bignum/assembly/integer/u256';
import { SafeMath256 } from '../libraries/SafeMath';

const STORAGE_BYTE_COST = 100_000;
const STORAGE_PREFIX_LENGTH = 4;
const BALANCE_KEY_PREFIX_LENGTH = 7;

export class IERC20 extends TokenWrapper implements Serializable {
  constructor(origin: Address = new Address()) {
    super(origin);
  }

  init(name: string, symbol: string, decimals: u8, supply: u256): void {
    const args = new Args().add(name).add(symbol).add(decimals).add(supply);
    call(this._origin, 'constructor', args, 0);
  }

  decimals(): u8 {
    const res = call(this._origin, 'decimals', NoArg, 0);
    return byteToU8(res);
  }

  /**
   * Returns the amount of token received by the pair
   *
   * @param {u256} reserve - The total reserve of token
   * @param {u256} fees - The total fees of token
   *
   * @return {u256} - The amount received by the pair
   */
  received(reserve: u256, fees: u256): u256 {
    const balance = this.balanceOf(Context.callee());
    return SafeMath256.sub(balance, SafeMath256.add(reserve, fees));
  }

  // Overide wrapper with storage cost
  transfer(toAccount: Address, nbTokens: u256): void {
    call(
      this._origin,
      'transfer',
      new Args().add(toAccount).add(nbTokens),
      computeTransferStorageCost(toAccount, this._origin),
    );
  }

  // Overide wrapper with storage cost
  transferFrom(
    ownerAccount: Address,
    recipientAccount: Address,
    nbTokens: u256,
  ): void {
    call(
      this._origin,
      'transferFrom',
      new Args().add(ownerAccount).add(recipientAccount).add(nbTokens),
      computeTransferStorageCost(recipientAccount, this._origin),
    );
  }

  serialize(): StaticArray<u8> {
    return this._origin.serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    return this._origin.deserialize(data, offset);
  }

  // OVERRIDE WRAPPER

  notEqual(other: IERC20): bool {
    return this._origin.notEqual(other._origin);
  }

  equals(other: IERC20): bool {
    return this._origin.equals(other._origin);
  }
}

function computeTransferStorageCost(receiver: Address, token: Address): u64 {
  if (Storage.hasOf(token, balanceKey(receiver))) {
    return 0;
  }
  const baseLength = STORAGE_PREFIX_LENGTH;
  const keyLength = BALANCE_KEY_PREFIX_LENGTH + receiver.toString().length;
  const valueLength = 4 * sizeof<u64>();
  return (baseLength + keyLength + valueLength) * STORAGE_BYTE_COST;
}

/**
 * @param address -
 * @returns the key of the balance in the storage for the given address
 */
function balanceKey(address: Address): StaticArray<u8> {
  return stringToBytes(BALANCE_KEY_PREFIX + address.toString());
}
