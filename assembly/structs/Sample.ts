import { Args, Result, Serializable } from '@massalabs/as-types';
import { Context } from '@massalabs/massa-as-sdk';
import { u256 } from 'as-bignum/assembly/integer/u256';

/// @dev Struct used for oracle samples operations
export class Sample implements Serializable {
  /**
   * @param {u64} timestamp The timestamp of the sample
   * @param {u256} cumulativeId The weighted average cumulative id
   * @param {u256} cumulativeVolatilityAccumulated The weighted average cumulative volatility accumulated
   * @param {u256} cumulativeBinCrossed The weighted average cumulative bin crossed
   */
  constructor(
    public timestamp: u64 = 0,
    public cumulativeId: u256 = u256.Zero,
    public cumulativeVolatilityAccumulated: u256 = u256.Zero,
    public cumulativeBinCrossed: u256 = u256.Zero,
  ) {}

  /**
   * @notice Function to update a sample
   * @param _activeId The active index of the pair during the latest swap
   * @param _volatilityAccumulated The volatility accumulated of the pair during the latest swap
   * @param _binCrossed The bin crossed during the latest swap
   * @returns Sample The updated sample
   */
  update(
    _activeId: u64,
    _volatilityAccumulated: u64,
    _binCrossed: u64,
  ): Sample {
    const _deltaTime = Context.timestamp() / 1000 - this.timestamp;

    // cumulative can overflow without any issue as what matter is the delta cumulative.
    // It would be an issue if 2 overflows would happen but way too much time should elapsed for it to happen.
    // The delta calculation needs to be unchecked math to allow for it to overflow again.
    const _cumulativeId = u256.add(
      this.cumulativeId,
      u256.mul(u256.from(_activeId), u256.from(_deltaTime)),
    );
    const _cumulativeVolatilityAccumulated = u256.add(
      this.cumulativeVolatilityAccumulated,
      u256.mul(u256.from(_volatilityAccumulated), u256.from(_deltaTime)),
    );
    const _cumulativeBinCrossed = u256.add(
      this.cumulativeBinCrossed,
      u256.mul(u256.from(_binCrossed), u256.from(_deltaTime)),
    );
    return new Sample(
      Context.timestamp() / 1000,
      _cumulativeId,
      _cumulativeVolatilityAccumulated,
      _cumulativeBinCrossed,
    );
  }

  serialize(): StaticArray<u8> {
    return new Args()
      .add(this.timestamp)
      .add(this.cumulativeId)
      .add(this.cumulativeVolatilityAccumulated)
      .add(this.cumulativeBinCrossed)
      .serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
    this.timestamp = args.nextU64().expect('Failed to deserialize timestamp');
    this.cumulativeId = args
      .nextU256()
      .expect('Failed to deserialize cumulativeId');
    this.cumulativeVolatilityAccumulated = args
      .nextU256()
      .expect('Failed to deserialize cumulativeVolatilityAccumulated');
    this.cumulativeBinCrossed = args
      .nextU256()
      .expect('Failed to deserialize cumulativeBinCrossed');
    return new Result(args.offset);
  }
}
