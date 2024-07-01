import { Args, Result, Serializable } from '@massalabs/as-types';
import { FeesDistribution } from './FeesDistribution';
import { u256 } from 'as-bignum/assembly/integer/u256';

/// @dev Structure to store the information of the pair such as:
export class PairInformation implements Serializable {
  /**
   * @param {u32} activeId - The current id used for swaps, this is also linked with the price
   * @param {u256} reserveX - The sum of amounts of tokenX across all bins
   * @param {u256} reserveY - The sum of amounts of tokenY across all bins
   * @param {FeesDistribution} feesX - The current amount of fees to distribute in tokenX (total, protocol)
   * @param {FeesDistribution} feesY - The current amount of fees to distribute in tokenY (total, protocol)
   */
  constructor(
    public activeId: u32 = 0,
    public reserveX: u256 = u256.Zero,
    public reserveY: u256 = u256.Zero,
    public feesX: FeesDistribution = new FeesDistribution(),
    public feesY: FeesDistribution = new FeesDistribution(),
    public oracleSampleLifetime: u32 = 0,
    public oracleSize: u32 = 0,
    public oracleActiveSize: u32 = 0,
    public oracleLastTimestamp: u64 = 0,
    public oracleId: u32 = 0,
  ) {}

  // ======================================================== //
  // ====                  SERIALIZATION                 ==== //
  // ======================================================== //

  serialize(): StaticArray<u8> {
    return new Args()
      .add(this.activeId)
      .add(this.reserveX)
      .add(this.reserveY)
      .add(this.feesX)
      .add(this.feesY)
      .add(this.oracleSampleLifetime)
      .add(this.oracleSize)
      .add(this.oracleActiveSize)
      .add(this.oracleLastTimestamp)
      .add(this.oracleId)
      .serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
    this.activeId = args.nextU32().expect('Failed to deserialize activeId');
    this.reserveX = args.nextU256().expect('Failed to deserialize reserveX');
    this.reserveY = args.nextU256().expect('Failed to deserialize reserveY');
    this.feesX = args
      .nextSerializable<FeesDistribution>()
      .expect('Failed to deserialize feesX');
    this.feesY = args
      .nextSerializable<FeesDistribution>()
      .expect('Failed to deserialize feesY');
    this.oracleSampleLifetime = args
      .nextU32()
      .expect('Failed to deserialize oracleSampleLifetime');
    this.oracleSize = args.nextU32().expect('Failed to deserialize oracleSize');
    this.oracleActiveSize = args
      .nextU32()
      .expect('Failed to deserialize oracleActiveSize');
    this.oracleLastTimestamp = args
      .nextU64()
      .expect('Failed to deserialize oracleLastTimestamp');
    this.oracleId = args.nextU32().expect('Failed to deserialize oracleId');
    return new Result(args.offset);
  }
}
