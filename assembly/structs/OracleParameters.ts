import { Args, Result, Serializable } from '@massalabs/as-types';

/// @dev Struct used for oracle parameters
export class OracleParameters implements Serializable {
  /**
   * @param {u32} oracleSampleLifetime The lifetime of a sample, it accumulates information for up to this timestamp
   * @param {u32} oracleSize The size of the oracle (last ids can be empty)
   * @param {u32} oracleActiveSize The active size of the oracle (no empty data)
   * @param {u64} oracleLastTimestamp The timestamp of the creation of the oracle's latest sample
   * @param {u32} oracleId The index of the oracle's latest sample
   * @param {u32} min The min delta time of two samples
   * @param {u32} max The safe max delta time of two samples
   */
  constructor(
    public oracleSampleLifetime: u32 = 0,
    public oracleSize: u32 = 0,
    public oracleActiveSize: u32 = 0,
    public oracleLastTimestamp: u64 = 0,
    public oracleId: u32 = 0,
    public min: u32 = 0,
    public max: u32 = 0,
  ) {}

  // ======================================================== //
  // ====                  SERIALIZATION                 ==== //
  // ======================================================== //

  serialize(): StaticArray<u8> {
    return new Args()
      .add(this.oracleSampleLifetime)
      .add(this.oracleSize)
      .add(this.oracleActiveSize)
      .add(this.oracleLastTimestamp)
      .add(this.oracleId)
      .add(this.min)
      .add(this.max)
      .serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
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
    this.min = args.nextU32().expect('Failed to deserialize min');
    this.max = args.nextU32().expect('Failed to deserialize max');
    return new Result(args.offset);
  }
}
