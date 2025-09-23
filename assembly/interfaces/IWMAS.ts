import { balanceKey } from '@massalabs/sc-standards/assembly/contracts/MRC20/MRC20-internals';
import { Args } from '@massalabs/as-types';
import { Address, call, Storage } from '@massalabs/massa-as-sdk';
import { MRC20Wrapper } from '@massalabs/sc-standards/assembly/contracts/MRC20/wrapper';
import { u256 } from 'as-bignum/assembly/integer/u256';
import {
  STORAGE_PREFIX_LENGTH,
  BALANCE_KEY_PREFIX_LENGTH,
  STORAGE_BYTE_COST,
  ZERO,
} from '../libraries';

export class IWMAS extends MRC20Wrapper {
  init(
    name: string = 'Wrapped Massa',
    symbol: string = 'WMAS',
    decimals: u8 = 9,
    supply: u256 = ZERO,
    coins: u64 = 0,
  ): void {
    super.init(name, symbol, decimals, supply, coins);
  }

  deposit(value: u64): void {
    call(this._origin, 'deposit', new Args(), value);
  }

  withdraw(value: u64, to: Address): void {
    call(this._origin, 'withdraw', new Args().add(value).add(to), 0);
  }

  computeMintStorageCost(receiver: Address): u64 {
    if (Storage.hasOf(this._origin, balanceKey(receiver))) {
      return 0;
    }
    const baseLength = STORAGE_PREFIX_LENGTH;
    const keyLength = BALANCE_KEY_PREFIX_LENGTH + receiver.toString().length;
    const valueLength = 4 * sizeof<u64>();
    return (baseLength + keyLength + valueLength) * STORAGE_BYTE_COST;
  }

  transferWithFee(toAccount: Address, nbTokens: u256, fee: u64 = 0): void {
    call(
      this._origin,
      'transfer',
      new Args().add(toAccount).add(nbTokens),
      fee,
    );
  }
}
