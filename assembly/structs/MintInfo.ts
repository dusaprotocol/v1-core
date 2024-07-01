import { Args, Result, Serializable } from '@massalabs/as-types';
import { u256 } from 'as-bignum/assembly/integer/u256';

/// @dev Structure to minting informations:
export class MintInfo implements Serializable {
  /**
     * @param {u256} amountXIn - The amount of token X sent
     * @param {u256} amountYIn - The amount of token Y sent
     * @param {u256} amountXAddedToPair - The amount of token X that have been actually added to the pair
     * @param {u256} amountYAddedToPair - The amount of token Y that have been actually added to the pair
     * @param {u256} activeFeeX - Fees X currently generated
     * @param {u256} activeFeeY - Fees Y currently generated
     * @param {u256} totalDistributionX - Total distribution of token X. Should be 1e18 (100%) or 0 (0%)
     * @param {u256} totalDistributionY - Total distribution of token Y. Should be 1e18 (100%) or 0 (0%)
     * @param {u64} id - Id of the current working bin when looping on the distribution array
     * @param {u256} amountX - The amount of token X deposited in the current bin
     * @param {u256} amountY - The amount of token Y deposited in the current bin
     * @param {u256} distributionX - Distribution of token X for the current working bin
     * @param {u256} distributionY - Distribution of token Y for the current working bin
 
     */
  constructor(
    public amountXIn: u256 = u256.Zero,
    public amountYIn: u256 = u256.Zero,
    public amountXAddedToPair: u256 = u256.Zero,
    public amountYAddedToPair: u256 = u256.Zero,
    public activeFeeX: u256 = u256.Zero,
    public activeFeeY: u256 = u256.Zero,
    public totalDistributionX: u256 = u256.Zero,
    public totalDistributionY: u256 = u256.Zero,
    public id: u64 = 0,
    public amountX: u256 = u256.Zero,
    public amountY: u256 = u256.Zero,
    public distributionX: u256 = u256.Zero,
    public distributionY: u256 = u256.Zero,
  ) {}

  // ======================================================== //
  // ====                  SERIALIZATION                 ==== //
  // ======================================================== //

  serialize(): StaticArray<u8> {
    return new Args()
      .add(this.amountXIn)
      .add(this.amountYIn)
      .add(this.amountXAddedToPair)
      .add(this.amountYAddedToPair)
      .add(this.activeFeeX)
      .add(this.activeFeeY)
      .add(this.totalDistributionX)
      .add(this.totalDistributionY)
      .add(this.id)
      .add(this.amountX)
      .add(this.amountY)
      .add(this.distributionX)
      .add(this.distributionY)
      .serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
    this.amountXIn = args.nextU256().expect('Failed to deserialize amountXIn');
    this.amountYIn = args.nextU256().expect('Failed to deserialize amountYIn');
    this.amountXAddedToPair = args
      .nextU256()
      .expect('Failed to deserialize amountXAddedToPair');
    this.amountYAddedToPair = args
      .nextU256()
      .expect('Failed to deserialize amountYAddedToPair');
    this.activeFeeX = args
      .nextU256()
      .expect('Failed to deserialize activeFeeX');
    this.activeFeeY = args
      .nextU256()
      .expect('Failed to deserialize activeFeeY');
    this.totalDistributionX = args
      .nextU256()
      .expect('Failed to deserialize totalDistributionX');
    this.totalDistributionY = args
      .nextU256()
      .expect('Failed to deserialize totalDistributionY');
    this.id = args.nextU64().expect('Failed to deserialize id');
    this.amountX = args.nextU256().expect('Failed to deserialize amountX');
    this.amountY = args.nextU256().expect('Failed to deserialize amountY');
    this.distributionX = args
      .nextU256()
      .expect('Failed to deserialize distributionX');
    this.distributionY = args
      .nextU256()
      .expect('Failed to deserialize distributionY');
    return new Result(args.offset);
  }
}
