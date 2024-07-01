import { Context } from '@massalabs/massa-as-sdk';
import { PersistentMap } from '../libraries/PersistentMap';
import { Sample } from './Sample';
import {
  Oracle__LookUpTimestampTooOld,
  Oracle__NotInitialized,
} from '../libraries/Errors';
import { u256 } from 'as-bignum/assembly/integer/u256';
import { GetSampleAtReturn } from './Returns';
import { SafeMath256 } from '../libraries';

/// @dev Helper contract for oracle on top of a persistent map
export class Oracle extends PersistentMap<u64, Sample> {
  /**
   * @notice View function to get the oracle's sample at `_ago` seconds
   * @dev Return a linearized sample, the weighted average of 2 neighboring samples
   * @param _activeSize The size of the oracle (without empty data)
   * @param _activeId The active index of the oracle
   * @param _lookUpTimestamp The looked up date
   * @return GetSampleAtReturn: timestamp, cumulativeId, cumulativeVolatilityAccumulated, cumulativeBinCrossed
   */
  getSampleAt(
    _activeSize: u64,
    _activeId: u64,
    _lookUpTimestamp: u64,
  ): GetSampleAtReturn {
    assert(_activeSize != 0, Oracle__NotInitialized());

    // Oldest sample
    const _nextId = (_activeId + 1) % _activeSize;
    let _sample = this.getSome(_nextId);
    let timestamp = _sample.timestamp;
    assert(
      timestamp <= _lookUpTimestamp,
      Oracle__LookUpTimestampTooOld(timestamp, _lookUpTimestamp),
    );

    // Most recent sample
    if (_activeSize != 1) {
      _sample = this.getSome(_activeId);
      timestamp = _sample.timestamp;

      if (timestamp > _lookUpTimestamp) {
        const res = this.binarySearch(_activeId, _activeSize, _lookUpTimestamp);
        _sample = res[0];
        const _next = res[1];

        if (_sample != _next) {
          //unsafe math is fine here as we know that _next.timestamp > _lookUpTimestamp > _sample.timestamp
          const _weightPrev = _next.timestamp - _lookUpTimestamp; // _next.timestamp- _sample.timestamp - (_lookUpTimestamp - _sample.timestamp);
          const _weightNext = _lookUpTimestamp - _sample.timestamp; // _next.timestamp - _sample.timestamp - (_next.timestamp - _lookUpTimestamp)
          const _totalWeight = _weightPrev + _weightNext; // _next.timestamp - _sample.timestamp;

          // unsafe math is fine here as div throws if division by 0
          const cumulativeId = u256.div(
            SafeMath256.add(
              SafeMath256.mul(
                u256.from(_sample.cumulativeId),
                u256.from(_weightPrev),
              ),
              SafeMath256.mul(
                u256.from(_next.cumulativeId),
                u256.from(_weightNext),
              ),
            ),
            u256.from(_totalWeight),
          );
          // unsafe math is fine here as div throws if division by 0
          const cumulativeVolatilityAccumulated = u256.div(
            SafeMath256.add(
              SafeMath256.mul(
                _sample.cumulativeVolatilityAccumulated,
                u256.from(_weightPrev),
              ),
              SafeMath256.mul(
                _next.cumulativeVolatilityAccumulated,
                u256.from(_weightNext),
              ),
            ),
            u256.from(_totalWeight),
          );
          // unsafe math is fine here as div throws if division by 0
          const cumulativeBinCrossed = u256.div(
            SafeMath256.add(
              SafeMath256.mul(
                _sample.cumulativeBinCrossed,
                u256.from(_weightPrev),
              ),
              SafeMath256.mul(
                _next.cumulativeBinCrossed,
                u256.from(_weightNext),
              ),
            ),
            u256.from(_totalWeight),
          );
          return new GetSampleAtReturn(
            _lookUpTimestamp,
            cumulativeId,
            cumulativeVolatilityAccumulated,
            cumulativeBinCrossed,
          );
        }
      }
    }

    return new GetSampleAtReturn(
      timestamp,
      _sample.cumulativeId,
      _sample.cumulativeVolatilityAccumulated,
      _sample.cumulativeBinCrossed,
    );
  }

  /**
   * @notice Function to update a sample
   * @param _size The size of the oracle (last ids can be empty)
   * @param _sampleLifetime The lifetime of a sample, it accumulates information for up to this timestamp
   * @param _lastTimestamp The timestamp of the creation of the oracle's latest sample
   * @param _lastIndex The index of the oracle's latest sample
   * @param _activeId The active index of the pair during the latest swap
   * @param _volatilityAccumulated The volatility accumulated of the pair during the latest swap
   * @param _binCrossed The bin crossed during the latest swap
   * @return updatedIndex The oracle updated index, it is either the same as before, or the next one
   */
  update(
    _size: u64,
    _sampleLifetime: u64,
    _lastTimestamp: u64,
    _lastIndex: u64,
    _activeId: u64,
    _volatilityAccumulated: u64,
    _binCrossed: u64,
  ): u64 {
    const _updatedSample = this.getSome(_lastIndex).update(
      _activeId,
      _volatilityAccumulated,
      _binCrossed,
    );
    let updatedIndex = _lastIndex;
    if (
      Context.timestamp() / 1000 - _lastTimestamp >= _sampleLifetime &&
      _lastTimestamp != 0
    ) {
      updatedIndex = (_lastIndex + 1) % _size;
    }
    this.set(updatedIndex, _updatedSample);
    return updatedIndex;
  }

  /**
   * @notice Initialize the sample
   * @param _id The index to initialize
   */
  initialize(_id: u64): void {
    this.set(_id, new Sample());
  }

  /**
   * @notice Binary search on oracle samples and return the 2 samples (as bytes32) that surrounds the `lookUpTimestamp`
   * @dev The oracle needs to be in increasing order `{_index + 1, _index + 2 ..., _index + _activeSize} % _activeSize`.
   * The sample that aren't initialized yet will be skipped as _activeSize only contains the samples that are initialized.
   * This function works only if `timestamp(_oracle[_index + 1 % _activeSize] <= _lookUpTimestamp <= timestamp(_oracle[_index]`.
   * The edge cases needs to be handled before
   * @param _index The current index of the oracle
   * @param _activeSize The size of the oracle (without empty data)
   * @param _lookUpTimestamp The looked up timestamp
   * @return Sample[] The last sample with a timestamp lower than the lookUpTimestamp and the first sample with a timestamp greater than the lookUpTimestamp
   */
  binarySearch(_index: u64, _activeSize: u64, _lookUpTimestamp: u64): Sample[] {
    // The sample with the lowest timestamp is the one right after _index
    let _low: u64 = 1;
    let _high = _activeSize;

    let _id: u64 = 0;
    let _middle: u64 = 0;

    let _sample = new Sample();
    let _sampleTimestamp: u64 = 0;

    while (_high >= _low) {
      _middle = (_low + _high) >> 1;
      _id = (_index + _middle) % _activeSize;
      _sample = this.getSome(_id);
      _sampleTimestamp = _sample.timestamp;
      if (_sampleTimestamp < _lookUpTimestamp) {
        _low = _middle + 1;
      } else if (_sampleTimestamp > _lookUpTimestamp) {
        _high = _middle - 1;
      } else {
        return [_sample, _sample];
      }
    }
    if (_sampleTimestamp < _lookUpTimestamp) {
      _id = (_id + 1) % _activeSize;
      return [_sample, this.getSome(_id)];
    }
    return [this.getSome(this.before(_id, _activeSize)), _sample];
  }

  /**
   * @notice Internal function to do positive (x - 1) % n
   * @dev This function is used to get the previous index of the oracle
   * @param x The value
   * @param n The modulo value
   * @return result The result
   */
  before(x: u64, n: u64): u64 {
    if (n > 0) {
      switch (u32(x)) {
        case 0: {
          return n - 1;
        }
        default: {
          return (x - 1) % n;
        }
      }
    }
    assert('Oracle__InvalidSize');
    return 0;
  }
}
