import { Args, Result, Serializable } from '@massalabs/as-types';
import { u256 } from 'as-bignum/assembly/integer/u256';

/**
 * @dev Structure to store the debts of users
 * @param {u256} debtX - The tokenX's debt
 * @param {u256} debtY - The tokenY's debt
 */
export class Debt implements Serializable {
  constructor(
    public debtX: u256 = u256.Zero,
    public debtY: u256 = u256.Zero,
  ) {}

  serialize(): StaticArray<u8> {
    return new Args().add(this.debtX).add(this.debtY).serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
    this.debtX = args.nextU256().expect('debtX is missing');
    this.debtY = args.nextU256().expect('debtY is missing');
    return new Result(args.offset);
  }
}
